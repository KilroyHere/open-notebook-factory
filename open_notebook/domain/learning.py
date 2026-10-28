"""Durable learning journeys and isolated aside conversations."""

from typing import Any, ClassVar, Dict, List, Literal, Optional

from loguru import logger
from pydantic import BaseModel, Field, field_validator

from open_notebook.database.repository import ensure_record_id, repo_query
from open_notebook.domain.base import ObjectModel
from open_notebook.exceptions import DatabaseOperationError, InvalidInputError

AsideStatus = Literal["active", "parked", "resolved", "discarded"]
JourneyStatus = Literal["active", "archived"]
AnchorType = Literal["message", "source", "citation", "equation"]


class AsideAnchor(BaseModel):
    """Stable origin for an aside.

    ``content`` is a snapshot so an aside remains understandable when its
    originating message or source changes. The optional locator fields provide
    a route back to the live object when it still exists.
    """

    type: AnchorType = "message"
    content: str = Field(min_length=1, max_length=20_000)
    message_id: Optional[str] = None
    source_id: Optional[str] = None
    locator: Optional[str] = Field(default=None, max_length=1_000)

    @field_validator("content")
    @classmethod
    def content_must_not_be_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise InvalidInputError("Aside anchor content cannot be empty")
        return stripped


class LearningJourney(ObjectModel):
    table_name: ClassVar[str] = "learning_journey"
    nullable_fields: ClassVar[set[str]] = {
        "active_session",
        "objective",
    }

    notebook: str
    main_session: str
    active_session: Optional[str] = None
    objective: Optional[str] = None
    status: JourneyStatus = "active"

    def _prepare_save_data(self) -> Dict[str, Any]:
        data = super()._prepare_save_data()
        for field in ("notebook", "main_session", "active_session"):
            if data.get(field):
                data[field] = ensure_record_id(data[field])
        return data

    @classmethod
    async def get_for_main_session(
        cls, main_session_id: str
    ) -> Optional["LearningJourney"]:
        try:
            rows = await repo_query(
                "SELECT * FROM learning_journey WHERE main_session = $session LIMIT 1",
                {"session": ensure_record_id(main_session_id)},
            )
            return cls(**rows[0]) if rows else None
        except Exception as exc:
            logger.exception(
                f"Failed to load learning journey for session {main_session_id}"
            )
            raise DatabaseOperationError("Failed to load learning journey") from exc

    @classmethod
    async def get_or_create(
        cls,
        notebook_id: str,
        main_session_id: str,
        objective: Optional[str] = None,
    ) -> "LearningJourney":
        existing = await cls.get_for_main_session(main_session_id)
        if existing:
            if objective is not None and objective != existing.objective:
                existing.objective = objective
                await existing.save()
            return existing

        journey = cls(
            notebook=notebook_id,
            main_session=main_session_id,
            active_session=main_session_id,
            objective=objective,
        )
        try:
            await journey.save()
            return journey
        except DatabaseOperationError:
            # The unique main-session index can race when two asides are opened
            # together. Resolve the winner instead of surfacing a false failure.
            existing = await cls.get_for_main_session(main_session_id)
            if existing:
                return existing
            raise

    async def get_asides(
        self, include_discarded: bool = False
    ) -> List["LearningAside"]:
        if not self.id:
            raise InvalidInputError("Journey must be saved before listing asides")
        query = "SELECT * FROM learning_aside WHERE journey = $journey"
        if not include_discarded:
            query += " AND status != 'discarded'"
        query += " ORDER BY created ASC"
        try:
            rows = await repo_query(query, {"journey": ensure_record_id(self.id)})
            return [LearningAside(**row) for row in rows]
        except Exception as exc:
            logger.exception(f"Failed to list asides for journey {self.id}")
            raise DatabaseOperationError("Failed to list learning asides") from exc

    async def get_updates(
        self, include_unmerged: bool = True
    ) -> List["LearningUpdate"]:
        asides = await self.get_asides(include_discarded=True)
        aside_ids = [ensure_record_id(aside.id) for aside in asides if aside.id]
        if not aside_ids:
            return []
        query = "SELECT * FROM learning_update WHERE aside IN $asides"
        if not include_unmerged:
            query += " AND include_in_main = true"
        query += " ORDER BY created ASC"
        try:
            rows = await repo_query(query, {"asides": aside_ids})
            return [LearningUpdate(**row) for row in rows]
        except Exception as exc:
            logger.exception(f"Failed to list learning updates for journey {self.id}")
            raise DatabaseOperationError("Failed to list learning updates") from exc


class LearningAside(ObjectModel):
    table_name: ClassVar[str] = "learning_aside"
    nullable_fields: ClassVar[set[str]] = {"parent_aside"}

    journey: str
    parent_aside: Optional[str] = None
    parent_session: str
    chat_session: str
    title: str = Field(min_length=1, max_length=200)
    status: AsideStatus = "active"
    anchor: AsideAnchor
    context_snapshot: List[Dict[str, str]] = Field(default_factory=list)

    @field_validator("title")
    @classmethod
    def title_must_not_be_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise InvalidInputError("Aside title cannot be empty")
        return stripped

    def _prepare_save_data(self) -> Dict[str, Any]:
        data = super()._prepare_save_data()
        for field in ("journey", "parent_aside", "parent_session", "chat_session"):
            if data.get(field):
                data[field] = ensure_record_id(data[field])
        return data

    @classmethod
    async def get_for_chat_session(cls, session_id: str) -> Optional["LearningAside"]:
        try:
            rows = await repo_query(
                "SELECT * FROM learning_aside WHERE chat_session = $session LIMIT 1",
                {"session": ensure_record_id(session_id)},
            )
            return cls(**rows[0]) if rows else None
        except Exception as exc:
            logger.exception(f"Failed to load aside for session {session_id}")
            raise DatabaseOperationError("Failed to load learning aside") from exc

    async def get_updates(self) -> List["LearningUpdate"]:
        if not self.id:
            raise InvalidInputError("Aside must be saved before listing updates")
        try:
            rows = await repo_query(
                "SELECT * FROM learning_update WHERE aside = $aside ORDER BY version ASC",
                {"aside": ensure_record_id(self.id)},
            )
            return [LearningUpdate(**row) for row in rows]
        except Exception as exc:
            logger.exception(f"Failed to list updates for aside {self.id}")
            raise DatabaseOperationError("Failed to list learning updates") from exc


class LearningUpdate(ObjectModel):
    table_name: ClassVar[str] = "learning_update"
    nullable_fields: ClassVar[set[str]] = {"relevance", "saved_note"}

    aside: str
    conclusion: str = Field(min_length=1, max_length=100_000)
    relevance: Optional[str] = Field(default=None, max_length=50_000)
    open_questions: List[str] = Field(default_factory=list, max_length=50)
    citations: List[str] = Field(default_factory=list, max_length=100)
    include_in_main: bool = True
    saved_note: Optional[str] = None
    version: int = Field(default=1, ge=1)

    @field_validator("conclusion")
    @classmethod
    def conclusion_must_not_be_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise InvalidInputError("Learning update conclusion cannot be empty")
        return stripped

    def _prepare_save_data(self) -> Dict[str, Any]:
        data = super()._prepare_save_data()
        for field in ("aside", "saved_note"):
            if data.get(field):
                data[field] = ensure_record_id(data[field])
        return data

    def as_context_entry(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "conclusion": self.conclusion,
            "relevance": self.relevance,
            "open_questions": self.open_questions,
            "citations": self.citations,
        }
