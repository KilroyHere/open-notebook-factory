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

# Characters of anchor text an aside stores. Longer anchors are accepted (Go
# deeper sends the whole answer) and clipped to this; the anchor's message_id
# and the aside's context_snapshot still lead to the full text.
ANCHOR_CONTENT_MAX_CHARS = 20_000
# How far back from the limit the clip looks for a word boundary. A last word
# longer than this (a URL, text without spaces) is cut through instead.
_ANCHOR_WORD_BOUNDARY_WINDOW = 2_000
# Tries at storing a resolution under the next free version number when
# concurrent resolutions of the same aside take the number first.
VERSION_SAVE_ATTEMPTS = 5


def clip_anchor_content(text: str, limit: int = ANCHOR_CONTENT_MAX_CHARS) -> str:
    """Strip ``text`` and, if it is longer than ``limit``, clip it with "…".

    The result is at most ``limit`` characters. The cut ends at a word
    boundary, so no word is split, unless the word at the cut is longer than
    ``_ANCHOR_WORD_BOUNDARY_WINDOW``.
    """
    text = text.strip()
    if len(text) <= limit:
        return text
    head = text[: limit - 1]
    if not text[limit - 1].isspace():
        # The cut falls inside a word: end at the whitespace before it.
        floor = max(0, len(head) - _ANCHOR_WORD_BOUNDARY_WINDOW)
        for index in range(len(head) - 1, floor - 1, -1):
            if head[index].isspace():
                head = head[:index]
                break
    return head.rstrip() + "…"


class AsideAnchor(BaseModel):
    """Stable origin for an aside.

    ``content`` is a snapshot so an aside remains understandable when its
    originating message or source changes. Text over ANCHOR_CONTENT_MAX_CHARS
    is clipped (:func:`clip_anchor_content`). The optional locator fields
    provide a route back to the live object when it still exists.
    """

    type: AnchorType = "message"
    content: str = Field(min_length=1, max_length=ANCHOR_CONTENT_MAX_CHARS)
    message_id: Optional[str] = None
    source_id: Optional[str] = None
    locator: Optional[str] = Field(default=None, max_length=1_000)

    @field_validator("content", mode="before")
    @classmethod
    def clip_long_content(cls, value: Any) -> Any:
        if isinstance(value, str) and len(value) > ANCHOR_CONTENT_MAX_CHARS:
            clipped = clip_anchor_content(value)
            if not clipped:
                raise InvalidInputError("Aside anchor content cannot be empty")
            return clipped
        return value

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
        journey = await cls.get_for_main_session(main_session_id)
        if journey is None:
            journey = cls(
                notebook=notebook_id,
                main_session=main_session_id,
                active_session=main_session_id,
                objective=objective,
            )
            try:
                await journey.save()
                return journey
            except (DatabaseOperationError, RuntimeError):
                # Two requests (two asides, or an aside and a section sync) can
                # both find no journey and both create one. The unique
                # main-session index rejects the second; repo_create reports
                # that, like a transaction conflict, as RuntimeError. Use the
                # journey that won instead of failing.
                winner = await cls.get_for_main_session(main_session_id)
                if winner is None:
                    raise
                journey = winner
        if objective is not None and objective != journey.objective:
            journey.objective = objective
            await journey.save()
        return journey

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

    def change_status(self, status: AsideStatus) -> None:
        """Apply a status change the learner asked for.

        Active and parked asides switch between those two or are discarded.
        An aside becomes resolved only through resolution and then keeps that
        status (resolving again replaces its conclusion), and a discarded
        aside stays discarded. Asking for the current status changes nothing;
        anything else raises InvalidInputError and leaves the aside as it was.
        """
        if status == self.status:
            return
        if self.status == "resolved":
            raise InvalidInputError(
                "Resolved asides cannot be reopened, parked or discarded. "
                "Resolve the aside again to change its conclusion."
            )
        if self.status == "discarded":
            raise InvalidInputError("Discarded asides cannot be reopened or parked")
        if status == "resolved":
            raise InvalidInputError("Resolve an aside to mark it resolved")
        self.status = status

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

    async def save_as_next_version(self, attempts: int = VERSION_SAVE_ATTEMPTS) -> None:
        """Store this update as its aside's next version.

        The version is one more than the highest stored one. Two resolutions
        of the same aside at once can pick the same number; the unique
        (aside, version) index rejects one, and that one is stored under the
        next free number instead, up to ``attempts`` tries in all. Any other
        failure is raised at once.
        """
        if self.id:
            raise InvalidInputError("This learning update is already stored")
        versions = await LearningUpdate.get_versions(self.aside)
        for attempt in range(1, attempts + 1):
            self.version = max((stored.version for stored in versions), default=0) + 1
            try:
                await self.save()
                return
            except RuntimeError:
                versions = await LearningUpdate.get_versions(self.aside)
                taken = any(stored.version == self.version for stored in versions)
                if not taken or attempt == attempts:
                    raise
                logger.debug(
                    f"Version {self.version} of {self.aside} was stored "
                    "concurrently; trying the next one"
                )

    async def set_saved_note(self, note_id: str) -> None:
        """Record the note this version was saved as.

        Only ``saved_note`` is written, so a backlink or an include_in_main
        change made since this copy was loaded is kept. The instance is
        refreshed from the stored record.
        """
        if not self.id:
            raise InvalidInputError(
                "Learning update must be saved before it can be changed"
            )
        try:
            rows = await repo_query(
                "UPDATE $update_id SET saved_note = $note RETURN AFTER",
                {
                    "update_id": ensure_record_id(self.id),
                    "note": ensure_record_id(note_id),
                },
            )
        except Exception as exc:
            logger.exception(f"Failed to link learning update {self.id} to {note_id}")
            raise DatabaseOperationError("Failed to update learning update") from exc
        if not rows:
            raise NotFoundError(f"learning_update with id {self.id} not found")
        stored = LearningUpdate(**rows[0])
        for name in LearningUpdate.model_fields:
            setattr(self, name, getattr(stored, name))

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
            except (DatabaseOperationError, RuntimeError):
                # A concurrent sync can create the same section first: the
                # unique (journey, start_message_id) index or a transaction
                # conflict rejects this one, as RuntimeError from repo_create.
                # Keep the section that won; fail if there is none.
                created = {
                    stored.start_message_id
                    for stored in await cls.get_for_journey(journey_id)
                }
                if message_id not in created:
                    raise
                logger.debug(f"Section for {message_id} was created concurrently")
                known.update(created)
            known.add(message_id)
        return await cls.get_for_journey(journey_id)
