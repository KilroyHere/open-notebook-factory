"""Learning asides against SurrealDB's embedded in-memory engine.

These tests run the real repository layer (``ObjectModel.save``,
``repo_create``, unique indexes, transaction conflicts, deletes) on
``mem://``. Every ``repo_*`` call shares one in-memory connection, so two
concurrent requests race the way they do against a server.
"""

import asyncio
from contextlib import asynccontextmanager, contextmanager
from typing import Any, AsyncIterator, Awaitable, Callable, TypeVar
from unittest.mock import patch

import pytest
from surrealdb import AsyncSurreal

from open_notebook.domain.learning import (
    AsideAnchor,
    LearningAside,
    LearningJourney,
    LearningSection,
    LearningUpdate,
)
from open_notebook.domain.notebook import (
    LEARNING_ASIDE_SESSION_KIND,
    ChatSession,
    Notebook,
)
from open_notebook.exceptions import DatabaseOperationError

T = TypeVar("T")


@asynccontextmanager
async def memory_database() -> AsyncIterator[Any]:
    """Point the repository at a fresh in-memory SurrealDB with every migration.

    Record creates run one at a time. The embedded engine does not reliably
    enforce a UNIQUE index between two inserts that overlap (a SurrealDB
    server does), so a concurrent create waits for the one before it, sees
    it, and is rejected by the index the way a server rejects it.
    """
    from open_notebook.database import repository
    from open_notebook.database.async_migrate import AsyncMigrationManager

    async with AsyncSurreal("mem://") as db:
        await db.use("learning_asides", "database")
        for migration in AsyncMigrationManager().up_migrations:
            await db.query(migration.sql)

        @asynccontextmanager
        async def shared_connection() -> AsyncIterator[Any]:
            yield db

        create_lock = asyncio.Lock()

        async def create_one_at_a_time(table: str, data: dict) -> Any:
            async with create_lock:
                return await repository.repo_create(table, data)

        with (
            patch.object(repository, "db_connection", shared_connection),
            patch("open_notebook.domain.base.repo_create", new=create_one_at_a_time),
            # Note.save() submits an embedding job; there is no worker here.
            patch(
                "open_notebook.domain.notebook.submit_command",
                return_value="command:embed",
            ),
        ):
            yield db


def read_together(
    method: Callable[..., Awaitable[T]], callers: int = 2
) -> Callable[..., Awaitable[T]]:
    """Wrap a read so its first ``callers`` calls return together.

    Each concurrent caller then reads before any of them writes: the
    interleaving in which two "find it or create it" calls both create.
    Later calls (a re-read after a failed create) pass straight through.
    """
    barrier = asyncio.Barrier(callers)
    calls = 0

    async def wrapper(*args: Any, **kwargs: Any) -> T:
        nonlocal calls
        result = await method(*args, **kwargs)
        calls += 1
        if calls <= callers:
            await barrier.wait()
        return result

    return wrapper


async def count(db: Any, table: str) -> int:
    rows = await db.query(f"SELECT count() AS n FROM {table} GROUP ALL")
    return rows[0]["n"] if rows else 0


async def notebook_with_main_session() -> tuple[Notebook, ChatSession]:
    notebook = Notebook(name="Notebook", description="")
    await notebook.save()
    main = ChatSession(title="Main")
    await main.save()
    await main.relate_to_notebook(notebook.id or "")
    return notebook, main


# --- Race guards ---------------------------------------------------------------


@pytest.mark.asyncio
async def test_concurrent_get_or_create_returns_the_one_journey():
    async with memory_database() as db:
        notebook, main = await notebook_with_main_session()
        with patch.object(
            LearningJourney,
            "get_for_main_session",
            new=read_together(LearningJourney.get_for_main_session),
        ):
            first, second = await asyncio.gather(
                LearningJourney.get_or_create(notebook.id or "", main.id or ""),
                LearningJourney.get_or_create(
                    notebook.id or "", main.id or "", "Understand the ELBO"
                ),
            )
        journeys = await count(db, "learning_journey")
        stored = await LearningJourney.get_for_main_session(main.id or "")

    assert journeys == 1
    assert stored is not None
    assert first.id == second.id == stored.id
    # The objective of the request that lost the race is not dropped.
    assert stored.objective == "Understand the ELBO"


@pytest.mark.asyncio
async def test_get_or_create_uses_the_winner_after_a_transaction_conflict():
    async with memory_database() as db:
        notebook, main = await notebook_with_main_session()
        winner = await LearningJourney.get_or_create(notebook.id or "", main.id or "")
        lookups = [None]  # The first read ran before the winner was committed.
        real_lookup = LearningJourney.get_for_main_session

        async def lookup(session_id: str):
            return lookups.pop() if lookups else await real_lookup(session_id)

        with (
            patch.object(LearningJourney, "get_for_main_session", new=lookup),
            patch.object(
                LearningJourney,
                "save",
                side_effect=RuntimeError(
                    "Failed to commit transaction due to a read or write "
                    "conflict. This transaction can be retried"
                ),
            ),
        ):
            journey = await LearningJourney.get_or_create(
                notebook.id or "", main.id or ""
            )
        journeys = await count(db, "learning_journey")

    assert journey.id == winner.id
    assert journeys == 1


@pytest.mark.asyncio
async def test_get_or_create_reraises_when_no_journey_won():
    async with memory_database() as db:
        notebook, main = await notebook_with_main_session()
        with patch.object(
            LearningJourney,
            "save",
            side_effect=RuntimeError("The connection was closed"),
        ):
            with pytest.raises(RuntimeError, match="connection was closed"):
                await LearningJourney.get_or_create(notebook.id or "", main.id or "")
        journeys = await count(db, "learning_journey")

    assert journeys == 0


@pytest.mark.asyncio
async def test_concurrent_section_sync_creates_each_section_once():
    async with memory_database() as db:
        notebook, main = await notebook_with_main_session()
        journey = await LearningJourney.get_or_create(notebook.id or "", main.id or "")
        turns = [("human:one", "Explain the ELBO"), ("human:two", "Why Jensen?")]
        with patch.object(
            LearningSection,
            "get_for_journey",
            new=read_together(LearningSection.get_for_journey),
        ):
            first, second = await asyncio.gather(
                LearningSection.ensure_for_turns(journey.id or "", turns),
                LearningSection.ensure_for_turns(journey.id or "", turns),
            )
        sections = await count(db, "learning_section")

    assert sections == 2
    for result in (first, second):
        assert sorted(section.start_message_id for section in result) == [
            "human:one",
            "human:two",
        ]


@pytest.mark.asyncio
async def test_section_sync_reraises_when_no_section_won():
    async with memory_database() as db:
        notebook, main = await notebook_with_main_session()
        journey = await LearningJourney.get_or_create(notebook.id or "", main.id or "")
        with patch.object(
            LearningSection,
            "save",
            side_effect=RuntimeError("The connection was closed"),
        ):
            with pytest.raises(RuntimeError, match="connection was closed"):
                await LearningSection.ensure_for_turns(
                    journey.id or "", [("human:one", "Explain the ELBO")]
                )
        sections = await count(db, "learning_section")

    assert sections == 0


@pytest.mark.asyncio
async def test_first_dive_and_section_sync_together_both_succeed():
    """Go deeper and the outline's section sync on a session with no journey."""
    import httpx
    from langchain_core.messages import AIMessage, HumanMessage

    from api.main import app

    transcript = [
        HumanMessage(content="Explain the ELBO", id="human-1"),
        AIMessage(content="The ELBO follows from Jensen.", id="ai-1"),
    ]
    async with memory_database() as db:
        notebook, main = await notebook_with_main_session()
        transport = httpx.ASGITransport(app=app)
        with (
            patch(
                "api.routers.learning._raw_session_messages",
                return_value=transcript,
            ),
            patch.object(
                LearningJourney,
                "get_for_main_session",
                new=read_together(LearningJourney.get_for_main_session),
            ),
        ):
            async with httpx.AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                dive, sync = await asyncio.gather(
                    client.post(
                        "/api/learning/asides",
                        json={
                            "notebook_id": notebook.id,
                            "parent_session_id": main.id,
                            "anchor": {
                                "type": "message",
                                "message_id": "ai-1",
                                "content": "The ELBO follows from Jensen.",
                            },
                        },
                    ),
                    client.post(
                        "/api/learning/sections/sync",
                        json={
                            "notebook_id": notebook.id,
                            "main_session_id": main.id,
                            "sections": [
                                {"start_message_id": "human-1", "title": "ELBO"}
                            ],
                        },
                    ),
                )
        journeys = await count(db, "learning_journey")

    assert (dive.status_code, sync.status_code) == (200, 200)
    assert journeys == 1
    assert dive.json()["journey_id"] == sync.json()[0]["journey_id"]


# --- Resolving an aside -------------------------------------------------------


async def journey_with_aside() -> tuple[Notebook, LearningJourney, LearningAside]:
    """A notebook whose main session has a journey with one active aside."""
    notebook, main = await notebook_with_main_session()
    journey = await LearningJourney.get_or_create(notebook.id or "", main.id or "")
    child = ChatSession(title="Why Jensen?", kind=LEARNING_ASIDE_SESSION_KIND)
    await child.save()
    await child.relate_to_notebook(notebook.id or "")
    aside = LearningAside(
        journey=journey.id or "",
        parent_session=main.id or "",
        chat_session=child.id or "",
        title="Why Jensen?",
        anchor=AsideAnchor(
            type="message", message_id="ai-1", content="The ELBO follows from Jensen."
        ),
    )
    await aside.save()
    journey.active_session = child.id
    await journey.save()
    return notebook, journey, aside


async def resolve(aside: LearningAside, conclusion: str, save_as_note: bool = True):
    from api.models import ResolveLearningAsideRequest
    from api.routers.learning import resolve_aside

    return await resolve_aside(
        aside.id or "",
        ResolveLearningAsideRequest(conclusion=conclusion, save_as_note=save_as_note),
    )


@contextmanager
def no_transcripts():
    """The aside response reads transcripts from the chat checkpoints."""
    with patch("api.routers.learning._raw_session_messages", return_value=[]):
        yield


@pytest.mark.asyncio
async def test_concurrent_resolves_store_two_versions_and_no_orphan_note():
    async with memory_database() as db:
        notebook, _, aside = await journey_with_aside()
        with (
            no_transcripts(),
            patch.object(
                LearningUpdate,
                "get_versions",
                new=read_together(LearningUpdate.get_versions),
            ),
        ):
            results = await asyncio.gather(
                resolve(aside, "Jensen gives a lower bound."),
                resolve(aside, "log is concave, so Jensen applies."),
                return_exceptions=True,
            )
        updates = await db.query(
            "SELECT version, saved_note FROM learning_update ORDER BY version"
        )
        notes = await db.query("SELECT id, ->artifact->notebook AS notebooks FROM note")

    assert [result for result in results if isinstance(result, BaseException)] == []
    assert [update["version"] for update in updates] == [1, 2]
    # Every note belongs to a stored version and to the notebook.
    assert sorted(str(note["id"]) for note in notes) == sorted(
        str(update["saved_note"]) for update in updates
    )
    assert all(
        [str(linked) for linked in note["notebooks"]] == [notebook.id] for note in notes
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "failing_step",
    [
        # The note is not stored.
        "open_notebook.domain.notebook.Note.save",
        # The note is stored but cannot be linked to the notebook.
        "open_notebook.domain.notebook.Note.add_to_notebook",
        # The note is stored and linked, but the version cannot name it.
        "open_notebook.domain.learning.LearningUpdate.set_saved_note",
    ],
)
async def test_resolve_saves_nothing_when_the_note_fails(failing_step):
    async with memory_database() as db:
        _, journey, aside = await journey_with_aside()
        failure = DatabaseOperationError("The database is unavailable")
        with no_transcripts(), patch(failing_step, side_effect=failure):
            with pytest.raises(DatabaseOperationError, match="unavailable"):
                await resolve(aside, "Jensen gives a lower bound.")
        updates = await count(db, "learning_update")
        notes = await count(db, "note")
        stored_aside = await LearningAside.get(aside.id or "")
        stored_journey = await LearningJourney.get(journey.id or "")

    # All or nothing: no version, no note, and the aside is still open.
    assert (updates, notes) == (0, 0)
    assert stored_aside.status == "active"
    assert stored_journey.active_session == aside.chat_session


@pytest.mark.asyncio
async def test_resolve_numbers_the_version_after_the_highest_stored_one():
    async with memory_database() as db:
        _, _, aside = await journey_with_aside()
        for version in (1, 3):
            await LearningUpdate(
                aside=aside.id or "", conclusion=f"Take {version}", version=version
            ).save()
        with no_transcripts():
            response = await resolve(aside, "Take 4", save_as_note=False)
        versions = await db.query(
            "SELECT VALUE version FROM learning_update ORDER BY version"
        )

    assert versions == [1, 3, 4]
    assert [update.version for update in response.updates] == [1, 3, 4]
    assert [update.superseded for update in response.updates] == [True, True, False]
