"""Domain and migration coverage for durable learning asides."""

from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from surrealdb import AsyncSurreal, RecordID

from open_notebook.database.repository import parse_record_ids
from open_notebook.domain.learning import (
    AsideAnchor,
    LearningAside,
    LearningJourney,
    LearningSection,
    LearningUpdate,
)
from open_notebook.domain.notebook import Notebook
from open_notebook.exceptions import InvalidInputError

MIGRATIONS_DIR = Path("open_notebook/database/migrations")


def _memory_repo_query(db: Any):
    """A repo_query stand-in that runs against an in-memory SurrealDB."""

    async def run(query: str, vars=None):
        result = parse_record_ids(await db.query(query, vars))
        if isinstance(result, str):
            raise RuntimeError(result)
        return result

    return run


class TestMigration26:
    def test_learning_tables_and_indexes_are_defined(self):
        sql = (MIGRATIONS_DIR / "26.surrealql").read_text()

        assert "learning_journey SCHEMAFULL" in sql
        assert "learning_aside SCHEMAFULL" in sql
        assert "learning_update SCHEMAFULL" in sql
        assert "idx_learning_journey_main_session" in sql
        assert "idx_learning_aside_chat_session" in sql
        assert "idx_learning_update_aside_version" in sql

    def test_down_migration_removes_child_tables_first(self):
        sql = (MIGRATIONS_DIR / "26_down.surrealql").read_text()

        assert sql.index("learning_update") < sql.index("learning_aside")
        assert sql.index("learning_aside") < sql.index("learning_journey")

    def test_migration_is_registered(self):
        from open_notebook.database.async_migrate import AsyncMigrationManager

        manager = AsyncMigrationManager()

        assert len(manager.up_migrations) == 28
        assert len(manager.up_migrations) == len(manager.down_migrations)
        assert "learning_journey" in manager.up_migrations[25].sql
        assert "applied_message_id" in manager.up_migrations[26].sql
        assert "learning_section" in manager.up_migrations[27].sql
        assert (
            "REMOVE TABLE IF EXISTS learning_section" in manager.down_migrations[27].sql
        )


@pytest.mark.asyncio
async def test_learning_queries_use_non_reserved_bind_parameters():
    """SurrealDB v2 reserves `$session`; exercise the real query parser."""
    async with AsyncSurreal("mem://") as db:
        await db.use("learning_asides", "query_bindings")
        await db.query((MIGRATIONS_DIR / "1.surrealql").read_text())
        await db.query((MIGRATIONS_DIR / "3.surrealql").read_text())
        await db.query((MIGRATIONS_DIR / "26.surrealql").read_text())
        await db.query((MIGRATIONS_DIR / "27.surrealql").read_text())
        await db.query((MIGRATIONS_DIR / "28.surrealql").read_text())
        await db.query(
            """
            CREATE notebook:one SET name = 'One', description = '';
            CREATE chat_session:main SET title = 'Main';
            RELATE chat_session:main->refers_to->notebook:one;
            CREATE learning_journey:one SET
                notebook = notebook:one,
                main_session = chat_session:main,
                active_session = chat_session:main,
                status = 'active';
            CREATE chat_session:aside SET title = 'Aside';
            CREATE learning_aside:one SET
                journey = learning_journey:one,
                parent_session = chat_session:main,
                chat_session = chat_session:aside,
                title = 'Aside',
                status = 'resolved',
                anchor = { type: 'message', content: 'Anchor' },
                context_snapshot = [];
            CREATE learning_update:one SET
                aside = learning_aside:one,
                conclusion = 'Conclusion',
                open_questions = [],
                citations = [],
                include_in_main = true,
                version = 1;
            CREATE learning_section:one SET
                journey = learning_journey:one,
                title = 'Evidence lower bound',
                pinned = true,
                start_message_id = 'human:one';
            """
        )

        relations = await db.query(
            """
            SELECT id FROM refers_to
            WHERE in = $session_id AND out = $notebook
            LIMIT 1
            """,
            {
                "session_id": RecordID("chat_session", "main"),
                "notebook": RecordID("notebook", "one"),
            },
        )
        journeys = await db.query(
            """
            SELECT * FROM learning_journey
            WHERE main_session = $session_id
            LIMIT 1
            """,
            {"session_id": RecordID("chat_session", "main")},
        )
        updates = await db.query(
            """
            SELECT * FROM learning_update
            WHERE $asides CONTAINS aside
            """,
            {"asides": [RecordID("learning_aside", "one")]},
        )
        sections = await db.query(
            """
            SELECT * FROM learning_section
            WHERE journey = learning_journey:one
            """
        )

    assert isinstance(relations, list)
    assert isinstance(journeys, list)
    assert isinstance(updates, list)
    assert isinstance(sections, list)
    assert len(relations) == 1
    assert len(journeys) == 1
    assert len(updates) == 1
    assert len(sections) == 1
    section = sections[0]
    assert isinstance(section, dict)
    assert section["title"] == "Evidence lower bound"
    assert section["pinned"] is True


@pytest.mark.asyncio
async def test_mark_applied_links_only_updates_without_a_backlink():
    async with AsyncSurreal("mem://") as db:
        await db.use("learning_asides", "mark_applied")
        await db.query((MIGRATIONS_DIR / "26.surrealql").read_text())
        await db.query((MIGRATIONS_DIR / "27.surrealql").read_text())
        await db.query(
            """
            CREATE learning_update:fresh SET
                aside = learning_aside:one, conclusion = 'Fresh', version = 1;
            CREATE learning_update:linked SET
                aside = learning_aside:two, conclusion = 'Linked', version = 1,
                applied_message_id = 'ai:earlier';
            """
        )
        with patch(
            "open_notebook.domain.learning.repo_query", new=_memory_repo_query(db)
        ):
            await LearningUpdate.mark_applied(
                [
                    "learning_update:fresh",
                    "learning_update:linked",
                    "learning_update:missing",
                ],
                "ai:new",
            )
        rows = await db.query("SELECT id, applied_message_id FROM learning_update")

    assert isinstance(rows, list)
    backlinks = {
        str(row["id"]): row.get("applied_message_id")
        for row in rows
        if isinstance(row, dict)
    }
    # The first reply stays linked; a missing ID is not created.
    assert backlinks == {
        "learning_update:fresh": "ai:new",
        "learning_update:linked": "ai:earlier",
    }


class TestLearningModels:
    def test_anchor_and_titles_are_trimmed(self):
        anchor = AsideAnchor(type="message", content="  selected explanation  ")
        aside = LearningAside(
            journey="learning_journey:one",
            parent_session="chat_session:main",
            chat_session="chat_session:aside",
            title="  Why does this follow?  ",
            anchor=anchor,
        )

        assert anchor.content == "selected explanation"
        assert aside.title == "Why does this follow?"

    @pytest.mark.parametrize(
        ("factory", "message"),
        [
            (
                lambda: AsideAnchor(type="message", content="   "),
                "Aside anchor content cannot be empty",
            ),
            (
                lambda: LearningAside(
                    journey="learning_journey:one",
                    parent_session="chat_session:main",
                    chat_session="chat_session:aside",
                    title=" ",
                    anchor=AsideAnchor(content="anchor"),
                ),
                "Aside title cannot be empty",
            ),
            (
                lambda: LearningUpdate(aside="learning_aside:one", conclusion="  "),
                "Learning update conclusion cannot be empty",
            ),
            (
                lambda: LearningSection(
                    journey="learning_journey:one",
                    title="  ",
                    start_message_id="human:one",
                ),
                "Section title cannot be empty",
            ),
        ],
    )
    def test_blank_user_content_is_rejected(self, factory, message):
        with pytest.raises(InvalidInputError, match=message):
            factory()

    def test_record_links_are_prepared_as_record_ids(self):
        journey = LearningJourney(
            notebook="notebook:one",
            main_session="chat_session:main",
            active_session="chat_session:aside",
        )
        aside = LearningAside(
            journey="learning_journey:one",
            parent_aside="learning_aside:parent",
            parent_session="chat_session:main",
            chat_session="chat_session:aside",
            title="Aside",
            anchor=AsideAnchor(content="anchor"),
        )
        update = LearningUpdate(
            aside="learning_aside:one",
            conclusion="A useful conclusion",
            saved_note="note:one",
        )

        assert str(journey._prepare_save_data()["notebook"]) == "notebook:one"
        assert str(journey._prepare_save_data()["active_session"]) == (
            "chat_session:aside"
        )
        assert str(aside._prepare_save_data()["parent_aside"]) == (
            "learning_aside:parent"
        )
        assert str(update._prepare_save_data()["saved_note"]) == "note:one"

    def test_context_entry_excludes_storage_only_fields(self):
        update = LearningUpdate(
            id="learning_update:one",
            aside="learning_aside:one",
            conclusion="The KL term regularizes the latent space.",
            relevance="This explains the second term in the objective.",
            open_questions=["Why a Gaussian prior?"],
            citations=["source:paper"],
        )

        assert update.as_context_entry() == {
            "id": "learning_update:one",
            "conclusion": "The KL term regularizes the latent space.",
            "relevance": "This explains the second term in the objective.",
            "open_questions": ["Why a Gaussian prior?"],
            "citations": ["source:paper"],
            "applied_message_id": None,
        }


@pytest.mark.asyncio
async def test_get_journey_for_main_session_normalizes_record_id():
    row = {
        "id": "learning_journey:one",
        "notebook": "notebook:one",
        "main_session": "chat_session:main",
        "active_session": "chat_session:main",
        "status": "active",
    }
    with patch(
        "open_notebook.domain.learning.repo_query",
        new_callable=AsyncMock,
        return_value=[row],
    ) as repo_query:
        journey = await LearningJourney.get_for_main_session("chat_session:main")

    assert journey is not None
    assert journey.id == "learning_journey:one"
    assert repo_query.await_args is not None
    assert str(repo_query.await_args.args[1]["session_id"]) == "chat_session:main"


@pytest.mark.asyncio
async def test_journey_lists_only_non_discarded_asides_by_default():
    journey = LearningJourney(
        id="learning_journey:one",
        notebook="notebook:one",
        main_session="chat_session:main",
    )
    with patch(
        "open_notebook.domain.learning.repo_query",
        new_callable=AsyncMock,
        return_value=[],
    ) as repo_query:
        assert await journey.get_asides() == []

    assert repo_query.await_args is not None
    assert "status != 'discarded'" in repo_query.await_args.args[0]


@pytest.mark.asyncio
async def test_notebook_chat_sessions_hide_learning_asides_by_default():
    notebook = Notebook(id="notebook:one", name="One", description="")
    with patch(
        "open_notebook.domain.notebook.repo_query",
        new_callable=AsyncMock,
        return_value=[],
    ) as repo_query:
        assert await notebook.get_chat_sessions() == []

    assert repo_query.await_args is not None
    assert (
        "select value chat_session from learning_aside"
        in (repo_query.await_args.args[0])
    )


def _journey_with_asides(*aside_ids: str):
    journey = LearningJourney(
        id="learning_journey:one",
        notebook="notebook:one",
        main_session="chat_session:main",
    )
    asides = [
        LearningAside(
            id=aside_id,
            journey="learning_journey:one",
            parent_session="chat_session:main",
            chat_session=f"chat_session:{aside_id.split(':')[1]}",
            title="Aside",
            status="resolved",
            anchor=AsideAnchor(content="Anchor"),
        )
        for aside_id in aside_ids
    ]
    return journey, asides


def _update_row(update_id: str, aside: str, version: int, include: bool = True):
    return {
        "id": update_id,
        "aside": aside,
        "conclusion": f"Conclusion {update_id}",
        "include_in_main": include,
        "version": version,
    }


@pytest.mark.asyncio
async def test_main_context_uses_only_the_latest_resolution_per_aside():
    journey, asides = _journey_with_asides("learning_aside:a", "learning_aside:b")
    rows = [
        _update_row("learning_update:a1", "learning_aside:a", 1),
        _update_row("learning_update:b1", "learning_aside:b", 1),
        _update_row("learning_update:a2", "learning_aside:a", 2),
    ]
    with (
        patch.object(
            LearningJourney, "get_asides", new_callable=AsyncMock, return_value=asides
        ),
        patch(
            "open_notebook.domain.learning.repo_query",
            new_callable=AsyncMock,
            return_value=rows,
        ),
    ):
        merged = await journey.get_updates(include_unmerged=False)
        everything = await journey.get_updates()

    assert [update.id for update in merged] == [
        "learning_update:b1",
        "learning_update:a2",
    ]
    # Superseded versions stay stored and listed for audit.
    assert [update.id for update in everything] == [
        "learning_update:a1",
        "learning_update:b1",
        "learning_update:a2",
    ]


@pytest.mark.asyncio
async def test_re_resolution_excluded_from_main_drops_the_older_version_too():
    journey, asides = _journey_with_asides("learning_aside:a")
    rows = [
        _update_row("learning_update:a1", "learning_aside:a", 1, include=True),
        _update_row("learning_update:a2", "learning_aside:a", 2, include=False),
    ]
    with (
        patch.object(
            LearningJourney, "get_asides", new_callable=AsyncMock, return_value=asides
        ),
        patch(
            "open_notebook.domain.learning.repo_query",
            new_callable=AsyncMock,
            return_value=rows,
        ),
    ):
        assert await journey.get_updates(include_unmerged=False) == []
