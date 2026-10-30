"""Durable learning journeys and isolated aside conversations."""

from typing import Any, ClassVar, Dict, List, Literal, Optional

from loguru import logger
from pydantic import BaseModel, Field, field_validator

from open_notebook.database.repository import ensure_record_id, repo_query
from open_notebook.domain.base import ObjectModel
from open_notebook.exceptions import (
    DatabaseOperationError,
    InvalidInputError,
    NotFoundError,
)

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
                "SELECT * FROM learning_journey WHERE main_session = $session_id LIMIT 1",
                {"session_id": ensure_record_id(main_session_id)},
            )
            return cls(**rows[0]) if rows else None
        except Exception as exc:
            logger.exception(
                f"Failed to load learning journey for session {main_session_id}"
            )
            raise DatabaseOperationError("Failed to load learning journey") from exc

    @classmethod
    async def get_for_notebook(cls, notebook_id: str) -> List["LearningJourney"]:
        try:
            rows = await repo_query(
                "SELECT * FROM learning_journey WHERE notebook = $notebook",
                {"notebook": ensure_record_id(notebook_id)},
            )
            return [cls(**row) for row in rows]
        except Exception as exc:
            logger.exception(f"Failed to list learning journeys for {notebook_id}")
            raise DatabaseOperationError("Failed to list learning journeys") from exc

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
        query = (
            "SELECT * FROM learning_update WHERE $asides CONTAINS aside "
            "ORDER BY created ASC"
        )
        try:
            rows = await repo_query(query, {"asides": aside_ids})
            updates = [LearningUpdate(**row) for row in rows]
        except Exception as exc:
            logger.exception(f"Failed to list learning updates for journey {self.id}")
            raise DatabaseOperationError("Failed to list learning updates") from exc
        if include_unmerged:
            return updates
        return [
            update
            for update in latest_update_versions(updates)
            if update.include_in_main
        ]

    async def delete_with_asides(self) -> bool:
        """Delete a journey, its updates, asides, and child chat sessions."""
        from open_notebook.domain.notebook import ChatSession

        for section in await LearningSection.get_for_journey(self.id or ""):
            await section.delete()
        for aside in await self.get_asides(include_discarded=True):
            for update in await aside.get_updates():
                await update.delete()
            try:
                child_session = await ChatSession.get(aside.chat_session)
                await child_session.delete()
            except NotFoundError:
                pass
            await aside.delete()
        return await super().delete()


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
                "SELECT * FROM learning_aside WHERE chat_session = $session_id LIMIT 1",
                {"session_id": ensure_record_id(session_id)},
            )
            return cls(**rows[0]) if rows else None
        except Exception as exc:
            logger.exception(f"Failed to load aside for session {session_id}")
            raise DatabaseOperationError("Failed to load learning aside") from exc

    async def get_updates(self) -> List["LearningUpdate"]:
        if not self.id:
            raise InvalidInputError("Aside must be saved before listing updates")
        return await LearningUpdate.get_versions(self.id)


class LearningUpdate(ObjectModel):
    table_name: ClassVar[str] = "learning_update"
    nullable_fields: ClassVar[set[str]] = {
        "relevance",
        "saved_note",
        "applied_message_id",
    }

    aside: str
    conclusion: str = Field(min_length=1, max_length=100_000)
    relevance: Optional[str] = Field(default=None, max_length=50_000)
    open_questions: List[str] = Field(default_factory=list, max_length=50)
    citations: List[str] = Field(default_factory=list, max_length=100)
    include_in_main: bool = True
    saved_note: Optional[str] = None
    applied_message_id: Optional[str] = None
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
            "applied_message_id": self.applied_message_id,
        }

    @classmethod
    async def get_versions(cls, aside_id: str) -> List["LearningUpdate"]:
        """Every stored resolution of an aside, oldest version first."""
        try:
            rows = await repo_query(
                "SELECT * FROM learning_update WHERE aside = $aside ORDER BY version ASC",
                {"aside": ensure_record_id(aside_id)},
            )
            return [cls(**row) for row in rows]
        except Exception as exc:
            logger.exception(f"Failed to list updates for aside {aside_id}")
            raise DatabaseOperationError("Failed to list learning updates") from exc

    async def set_include_in_main(self, include_in_main: bool) -> None:
        """Send this conclusion with main-chat turns, or leave it out.

        The version is changed in place: no new version is stored and only
        ``include_in_main`` is written, so a concurrent backlink is not lost.
        Only the latest version of an aside can reach main context
        (:func:`latest_update_versions`), so changing a superseded version is
        rejected: it could never take effect. The instance is refreshed from the
        stored record.
        """
        if not self.id:
            raise InvalidInputError(
                "Learning update must be saved before it can be changed"
            )
        versions = await LearningUpdate.get_versions(self.aside)
        if not any(version.id == self.id for version in versions):
            raise NotFoundError(f"learning_update with id {self.id} not found")
        if not any(
            version.id == self.id for version in latest_update_versions(versions)
        ):
            newest = max(versions, key=lambda version: version.version)
            raise InvalidInputError(
                f"Version {self.version} of this conclusion was replaced by "
                f"version {newest.version}. Only the latest version of an aside's "
                "conclusion can be included in or left out of the main chat."
            )
        try:
            rows = await repo_query(
                "UPDATE $update_id SET include_in_main = $include_in_main RETURN AFTER",
                {
                    "update_id": ensure_record_id(self.id),
                    "include_in_main": include_in_main,
                },
            )
        except Exception as exc:
            logger.exception(f"Failed to change learning update {self.id}")
            raise DatabaseOperationError("Failed to update learning update") from exc
        if not rows:
            raise NotFoundError(f"learning_update with id {self.id} not found")
        stored = LearningUpdate(**rows[0])
        for name in LearningUpdate.model_fields:
            setattr(self, name, getattr(stored, name))

    @classmethod
    async def mark_applied(cls, update_ids: List[str], message_id: str) -> None:
        """Record ``message_id`` as the first main reply that used these updates.

        Only ``applied_message_id`` is written, and only on versions that have
        no backlink yet, so an update that already names its first reply keeps
        it and a concurrent edit of another field is never overwritten by a
        stale copy of the record.
        """
        if not update_ids:
            return
        try:
            await repo_query(
                """
                UPDATE $update_ids SET applied_message_id = $message_id
                WHERE applied_message_id = NONE
                """,
                {
                    "update_ids": [
                        ensure_record_id(update_id) for update_id in update_ids
                    ],
                    "message_id": message_id,
                },
            )
        except Exception as exc:
            logger.exception(f"Failed to link learning updates to {message_id}")
            raise DatabaseOperationError("Failed to link learning updates") from exc


def latest_update_versions(updates: List["LearningUpdate"]) -> List["LearningUpdate"]:
    """Keep only the newest version of each aside's resolution.

    Re-resolving an aside stores a new version; earlier versions stay for audit
    but are superseded and must not reach the main chat context. The latest
    version decides alone, so a re-resolution that is not included in main
    removes that aside's conclusion from main context. Input order is kept.
    """
    latest: Dict[str, "LearningUpdate"] = {}
    for update in updates:
        current = latest.get(update.aside)
        if current is None or update.version >= current.version:
            latest[update.aside] = update
    keep = {id(update) for update in latest.values()}
    return [update for update in updates if id(update) in keep]


class LearningSection(ObjectModel):
    """A named span of the main thread, opened by one human message."""

    table_name: ClassVar[str] = "learning_section"

    journey: str
    title: str = Field(min_length=1, max_length=200)
    pinned: bool = False
    start_message_id: str = Field(min_length=1, max_length=200)

    @field_validator("title")
    @classmethod
    def title_must_not_be_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise InvalidInputError("Section title cannot be empty")
        return stripped

    def _prepare_save_data(self) -> Dict[str, Any]:
        data = super()._prepare_save_data()
        if data.get("journey"):
            data["journey"] = ensure_record_id(data["journey"])
        return data

    @classmethod
    async def get_for_journey(cls, journey_id: str) -> List["LearningSection"]:
        if not journey_id:
            return []
        try:
            rows = await repo_query(
                """
                SELECT * FROM learning_section
                WHERE journey = $journey
                ORDER BY created ASC
                """,
                {"journey": ensure_record_id(journey_id)},
            )
            return [cls(**row) for row in rows]
        except Exception as exc:
            logger.exception(f"Failed to list sections for journey {journey_id}")
            raise DatabaseOperationError("Failed to list learning sections") from exc

    @classmethod
    async def ensure_for_turns(
        cls, journey_id: str, turns: List[tuple[str, str]]
    ) -> List["LearningSection"]:
        """Create a section for each new human turn. Existing names stay put."""
        existing = await cls.get_for_journey(journey_id)
        known = {section.start_message_id for section in existing}
        for message_id, title in turns:
            if message_id in known:
                continue
            section = cls(
                journey=journey_id,
                title=title,
                start_message_id=message_id,
                pinned=False,
            )
            try:
                await section.save()
            except DatabaseOperationError:
                logger.exception(f"Failed to create section for message {message_id}")
            known.add(message_id)
        return await cls.get_for_journey(journey_id)
