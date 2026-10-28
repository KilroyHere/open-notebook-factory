"""Domain and migration coverage for durable learning asides."""

from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from open_notebook.domain.learning import (
    AsideAnchor,
    LearningAside,
    LearningJourney,
    LearningUpdate,
)
from open_notebook.domain.notebook import Notebook
from open_notebook.exceptions import InvalidInputError

MIGRATIONS_DIR = Path("open_notebook/database/migrations")


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

        assert len(manager.up_migrations) == 26
        assert len(manager.up_migrations) == len(manager.down_migrations)
        assert "learning_journey" in manager.up_migrations[25].sql


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
    assert str(repo_query.await_args.args[1]["session"]) == "chat_session:main"


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

    assert (
        "select value chat_session from learning_aside"
        in (repo_query.await_args.args[0])
    )
