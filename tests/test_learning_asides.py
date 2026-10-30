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

        assert len(manager.up_migrations) == 29
        assert len(manager.up_migrations) == len(manager.down_migrations)
        assert "learning_journey" in manager.up_migrations[25].sql
        assert "applied_message_id" in manager.up_migrations[26].sql
        assert "learning_section" in manager.up_migrations[27].sql
        assert (
            "REMOVE TABLE IF EXISTS learning_section" in manager.down_migrations[27].sql
        )


class TestMigration29:
    def test_session_kind_field_backfill_and_index_are_registered(self):
        from open_notebook.database.async_migrate import AsyncMigrationManager

        manager = AsyncMigrationManager()
        up = manager.up_migrations[28].sql
        down = manager.down_migrations[28].sql

        assert 'kind ON TABLE chat_session TYPE string DEFAULT "chat"' in up
        assert "SELECT VALUE chat_session FROM learning_aside" in up
        assert "idx_chat_session_kind" in up
        # The field definition must go before UNSET, or TYPE string rejects it.
        assert down.index("REMOVE FIELD IF EXISTS kind") < down.index("UNSET kind")
        assert "REMOVE INDEX IF EXISTS idx_chat_session_kind" in down

    @pytest.mark.asyncio
    async def test_backfill_marks_aside_sessions_and_the_list_hides_them(self):
        from open_notebook.database.async_migrate import AsyncMigrationManager

        manager = AsyncMigrationManager()
        async with AsyncSurreal("mem://") as db:
            await db.use("learning_asides", "session_kind")
            for number in (1, 3, 8, 26):
                await db.query((MIGRATIONS_DIR / f"{number}.surrealql").read_text())
            # Data from before migration 29: no session has a kind yet.
            await db.query(
                """
                CREATE notebook:one SET name = 'One', description = '';
                CREATE notebook:two SET name = 'Two', description = '';
                CREATE source:paper SET title = 'Paper';
                CREATE chat_session:older SET title = 'Older',
                    updated = d'2026-10-01T00:00:00Z';
                CREATE chat_session:newer SET title = 'Newer',
                    updated = d'2026-10-03T00:00:00Z';
                CREATE chat_session:aside SET title = 'Aside',
                    updated = d'2026-10-04T00:00:00Z';
                CREATE chat_session:elsewhere SET title = 'Elsewhere',
                    updated = d'2026-10-05T00:00:00Z';
                CREATE chat_session:source_chat SET title = 'Source chat',
                    updated = d'2026-10-06T00:00:00Z';
                RELATE chat_session:older->refers_to->notebook:one;
                RELATE chat_session:newer->refers_to->notebook:one;
                RELATE chat_session:aside->refers_to->notebook:one;
                RELATE chat_session:elsewhere->refers_to->notebook:two;
                RELATE chat_session:source_chat->refers_to->source:paper;
                CREATE learning_aside:one SET
                    journey = learning_journey:one,
                    parent_session = chat_session:newer,
                    chat_session = chat_session:aside,
                    title = 'Aside',
                    status = 'active',
                    anchor = { type: 'message', content: 'Anchor' },
                    context_snapshot = [];
                CREATE learning_aside:dangling SET
                    journey = learning_journey:one,
                    parent_session = chat_session:newer,
                    chat_session = chat_session:deleted,
                    title = 'Dangling',
                    status = 'discarded',
                    anchor = { type: 'message', content: 'Anchor' },
                    context_snapshot = [];
                """
            )

            await db.query(manager.up_migrations[28].sql)
            kinds = await db.query("SELECT id, kind FROM chat_session")
            notebook = Notebook(id="notebook:one", name="One", description="")
            with patch(
                "open_notebook.domain.notebook.repo_query",
                new=_memory_repo_query(db),
            ):
                visible = await notebook.get_chat_sessions()
                everything = await notebook.get_chat_sessions(
                    include_learning_asides=True
                )

            await db.query(manager.down_migrations[28].sql)
            rolled_back = await db.query("SELECT * FROM chat_session")
            table_info = await db.query("INFO FOR TABLE chat_session")

        assert isinstance(kinds, list)
        assert {
            str(row["id"]): row["kind"] for row in kinds if isinstance(row, dict)
        } == {
            "chat_session:older": "chat",
            "chat_session:newer": "chat",
            "chat_session:aside": "learning_aside",
            "chat_session:elsewhere": "chat",
            "chat_session:source_chat": "chat",
        }
        # Newest first, aside hidden, other notebooks and sources not listed.
        assert [session.id for session in visible] == [
            "chat_session:newer",
            "chat_session:older",
        ]
        assert [session.kind for session in visible] == ["chat", "chat"]
        assert [session.id for session in everything] == [
            "chat_session:aside",
            "chat_session:newer",
            "chat_session:older",
        ]
        assert everything[0].kind == "learning_aside"
        assert isinstance(rolled_back, list)
        assert len(rolled_back) == 5
        assert all(isinstance(row, dict) and "kind" not in row for row in rolled_back)
        assert isinstance(table_info, dict)
        fields, indexes = table_info["fields"], table_info["indexes"]
        assert isinstance(fields, dict) and isinstance(indexes, dict)
        assert "kind" not in fields
        assert "idx_chat_session_kind" not in indexes


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

    def test_long_anchor_is_stored_clipped_at_a_word_boundary(self):
        from open_notebook.domain.learning import ANCHOR_CONTENT_MAX_CHARS

        text = "  " + "word " * 10_000 + "  "

        anchor = AsideAnchor(content=text)

        assert len(anchor.content) <= ANCHOR_CONTENT_MAX_CHARS
        assert anchor.content.endswith("word…")
        assert text.strip().startswith(anchor.content[:-1])

    def test_anchor_within_the_limit_is_kept_whole(self):
        from open_notebook.domain.learning import ANCHOR_CONTENT_MAX_CHARS

        text = "a" * ANCHOR_CONTENT_MAX_CHARS

        assert AsideAnchor(content=f" {text} ").content == text

    @pytest.mark.parametrize(
        ("text", "expected"),
        [
            # Within the limit once stripped: unchanged.
            ("  alpha beta gamm  ", "alpha beta gamm"),
            # The cut falls inside "gamma": the partial word is dropped.
            ("alpha beta gamma", "alpha beta…"),
            ("alpha beta   gamma", "alpha beta…"),
            ("alpha\nbeta gamma", "alpha\nbeta…"),
            # The cut falls right after "gam": it is a whole word and stays.
            ("alpha beta gam xyz", "alpha beta gam…"),
            # No whitespace at all: cut through.
            ("abcdefghijklmnopq", "abcdefghijklmn…"),
        ],
    )
    def test_clip_anchor_content(self, text, expected):
        from open_notebook.domain.learning import clip_anchor_content

        clipped = clip_anchor_content(text, limit=15)

        assert clipped == expected
        assert len(clipped) <= 15

    def test_clip_cuts_through_a_last_word_too_long_to_drop(self):
        from open_notebook.domain.learning import (
            ANCHOR_CONTENT_MAX_CHARS,
            clip_anchor_content,
        )

        # One space near the start, then a single 30,000-character token.
        text = "start " + "x" * 30_000

        clipped = clip_anchor_content(text)

        assert len(clipped) == ANCHOR_CONTENT_MAX_CHARS
        assert clipped == text[: ANCHOR_CONTENT_MAX_CHARS - 1] + "…"

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
    query, params = repo_query.await_args.args
    # The session's own marker, not a scan of the learning_aside table.
    assert "kind != $aside_kind" in query
    assert "from learning_aside" not in query.lower()
    assert params["aside_kind"] == "learning_aside"
    assert params["include_learning_asides"] is False
    assert str(params["id"]) == "notebook:one"


@pytest.mark.asyncio
async def test_notebook_chat_sessions_can_include_learning_asides():
    notebook = Notebook(id="notebook:one", name="One", description="")
    row = {
        "id": "chat_session:aside",
        "title": "Aside",
        "kind": "learning_aside",
    }
    with patch(
        "open_notebook.domain.notebook.repo_query",
        new_callable=AsyncMock,
        return_value=[row],
    ) as repo_query:
        sessions = await notebook.get_chat_sessions(include_learning_asides=True)

    assert [session.kind for session in sessions] == ["learning_aside"]
    assert repo_query.await_args is not None
    assert repo_query.await_args.args[1]["include_learning_asides"] is True


def test_chat_sessions_default_to_the_visible_kind():
    from open_notebook.domain.notebook import ChatSession

    session = ChatSession(title="Main")

    assert session.kind == "chat"
    assert session._prepare_save_data()["kind"] == "chat"
    # Rows from before migration 29 have no kind and read as normal sessions.
    assert ChatSession(id="chat_session:old", title="Old").kind == "chat"


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


async def _two_resolutions(db: Any) -> None:
    """One aside resolved twice: version 1 (merged earlier) and version 2."""
    await db.query((MIGRATIONS_DIR / "26.surrealql").read_text())
    await db.query((MIGRATIONS_DIR / "27.surrealql").read_text())
    await db.query(
        """
        CREATE learning_update:v1 SET
            aside = learning_aside:one, conclusion = 'First take',
            include_in_main = true, version = 1,
            applied_message_id = 'ai:first-reply';
        CREATE learning_update:v2 SET
            aside = learning_aside:one, conclusion = 'Revised take',
            include_in_main = true, version = 2;
        """
    )


async def _stored_update(db: Any, update_id: str) -> LearningUpdate:
    rows = parse_record_ids(
        await db.query("SELECT * FROM $id", {"id": RecordID.parse(update_id)})
    )
    return LearningUpdate(**rows[0])


class TestIncludeInMainToggle:
    @pytest.mark.asyncio
    async def test_latest_version_is_changed_in_place(self):
        async with AsyncSurreal("mem://") as db:
            await db.use("learning_asides", "toggle_latest")
            await _two_resolutions(db)
            latest = await _stored_update(db, "learning_update:v2")
            with patch(
                "open_notebook.domain.learning.repo_query", new=_memory_repo_query(db)
            ):
                await latest.set_include_in_main(False)
                left_out = await _stored_update(db, "learning_update:v2")
                versions = await LearningUpdate.get_versions("learning_aside:one")
                await latest.set_include_in_main(True)
                put_back = await _stored_update(db, "learning_update:v2")

        assert left_out.include_in_main is False
        assert put_back.include_in_main is True
        assert latest.include_in_main is True
        # No new version, and nothing else on the record changed.
        assert [version.version for version in versions] == [1, 2]
        assert left_out.conclusion == "Revised take"
        assert left_out.applied_message_id is None

    @pytest.mark.asyncio
    async def test_superseded_version_is_rejected(self):
        async with AsyncSurreal("mem://") as db:
            await db.use("learning_asides", "toggle_superseded")
            await _two_resolutions(db)
            superseded = await _stored_update(db, "learning_update:v1")
            with patch(
                "open_notebook.domain.learning.repo_query", new=_memory_repo_query(db)
            ):
                with pytest.raises(InvalidInputError, match="replaced by version 2"):
                    await superseded.set_include_in_main(False)
            unchanged = await _stored_update(db, "learning_update:v1")

        assert unchanged.include_in_main is True
        assert unchanged.applied_message_id == "ai:first-reply"

    @pytest.mark.asyncio
    async def test_unsaved_update_is_rejected(self):
        update = LearningUpdate(aside="learning_aside:one", conclusion="Draft")
        with patch(
            "open_notebook.domain.learning.repo_query", new_callable=AsyncMock
        ) as repo_query:
            with pytest.raises(InvalidInputError, match="must be saved"):
                await update.set_include_in_main(False)

        repo_query.assert_not_called()

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "query_results",
        [
            # The aside no longer lists this version.
            [[]],
            # It disappeared between the check and the write.
            [
                [
                    {
                        "id": "learning_update:v1",
                        "aside": "learning_aside:one",
                        "conclusion": "Gone",
                        "version": 1,
                    }
                ],
                [],
            ],
        ],
        ids=["not-listed", "deleted-before-write"],
    )
    async def test_missing_update_is_not_found(self, query_results):
        from open_notebook.exceptions import NotFoundError

        update = LearningUpdate(
            id="learning_update:v1",
            aside="learning_aside:one",
            conclusion="Gone",
            version=1,
        )
        with patch(
            "open_notebook.domain.learning.repo_query",
            new_callable=AsyncMock,
            side_effect=query_results,
        ):
            with pytest.raises(NotFoundError):
                await update.set_include_in_main(False)


class TestSaveAsNextVersion:
    @staticmethod
    def _stored(version: int) -> LearningUpdate:
        return LearningUpdate(
            id=f"learning_update:v{version}",
            aside="learning_aside:one",
            conclusion=f"Take {version}",
            version=version,
        )

    @pytest.mark.asyncio
    async def test_a_taken_number_is_retried_a_bounded_number_of_times(self):
        from open_notebook.domain.learning import VERSION_SAVE_ATTEMPTS

        stored: list[LearningUpdate] = []

        async def versions(aside_id: str) -> list[LearningUpdate]:
            return list(stored)

        async def collide(update: LearningUpdate) -> None:
            # Another resolution stores this number first, every time.
            stored.append(self._stored(update.version))
            raise RuntimeError("Database index already contains it")

        update = LearningUpdate(aside="learning_aside:one", conclusion="Mine")
        with (
            patch.object(LearningUpdate, "get_versions", new=versions),
            patch.object(LearningUpdate, "save", new=collide),
        ):
            with pytest.raises(RuntimeError, match="already contains"):
                await update.save_as_next_version()

        assert [taken.version for taken in stored] == list(
            range(1, VERSION_SAVE_ATTEMPTS + 1)
        )

    @pytest.mark.asyncio
    async def test_another_failure_is_not_retried(self):
        saves = AsyncMock(side_effect=RuntimeError("The connection was closed"))
        update = LearningUpdate(aside="learning_aside:one", conclusion="Mine")
        with (
            patch.object(
                LearningUpdate,
                "get_versions",
                new=AsyncMock(return_value=[self._stored(1)]),
            ),
            patch.object(LearningUpdate, "save", new=saves),
        ):
            with pytest.raises(RuntimeError, match="connection was closed"):
                await update.save_as_next_version()

        assert saves.await_count == 1
        assert update.version == 2

    @pytest.mark.asyncio
    async def test_a_stored_update_is_not_stored_again(self):
        with pytest.raises(InvalidInputError, match="already stored"):
            await self._stored(1).save_as_next_version()
