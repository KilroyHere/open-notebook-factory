"""Shared helpers for the chat and source-chat routers.

Both `api/routers/chat.py` and `api/routers/source_chat.py` operate on
`chat_session` records linked to their parent (notebook or source) via the
`refers_to` relation, and both convert LangGraph state messages into API
response models. This module holds the single definition of those pieces,
plus the learning-context helpers that main chat (`chat.py`) and learning
asides (`learning.py`) share.

Behavior notes:
- The helpers raise exactly what the previously inlined blocks raised
  (`NotFoundError` propagates from `ObjectModel.get`, `HTTPException(404)` for
  a missing relation), so each router's existing try/except arms keep mapping
  them to the same status codes and messages as before.
"""

from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

from fastapi import HTTPException
from loguru import logger
from pydantic import BaseModel, Field

from open_notebook.database.repository import ensure_record_id, repo_query
from open_notebook.domain.learning import LearningJourney, LearningUpdate
from open_notebook.domain.notebook import ChatSession, Source
from open_notebook.utils.token_utils import token_count


# Shared response models
class ChatMessage(BaseModel):
    id: str = Field(..., description="Message ID")
    type: str = Field(..., description="Message type (human|ai)")
    content: str = Field(..., description="Message content")
    timestamp: Optional[str] = Field(None, description="Message timestamp")


class SuccessResponse(BaseModel):
    success: bool = Field(True, description="Operation success status")
    message: str = Field(..., description="Success message")


INTERNAL_ID_INSTRUCTION = (
    "Never expose or cite internal learning_aside, learning_update, "
    "chat_session, or message IDs. Only cite source, note, or "
    "source_insight IDs that appear in the selected research context."
)

LEARNING_UPDATES_INSTRUCTION = (
    "learning_updates are conclusions the learner accepted from side "
    "conversations. Use them as background for your answer. They are not "
    "documents and have no ID: never cite them in brackets, and never write "
    "[learning_updates] or similar. When you rely on one, cite the source or "
    "note IDs listed in its citations instead, or no citation if it has none. "
    + INTERNAL_ID_INSTRUCTION
)

# Fields of an accepted learning update that the model may see. Record IDs
# (`id`, `aside`) and backlinks (`applied_message_id`) stay server-side so the
# model has nothing internal to cite.
_MODEL_VISIBLE_UPDATE_FIELDS = (
    "conclusion",
    "relevance",
    "open_questions",
    "citations",
)

# Token budget for the accepted learning conclusions sent with one main-chat
# turn. Without a cap, every conclusion a learner ever accepted would ride along
# on every turn, and a long journey would crowd out the sources and the
# conversation itself. Each conclusion is measured as the model sees it (its
# conclusion, relevance, open questions and citations, rendered like the rest
# of the context dict) with token_count(), which falls back to an estimate when
# the tokenizer is unavailable. The newest conclusions are kept first; the first
# one that does not fit ends the selection, so it and every older one are left
# out of the turn, and POST /chat/context reports how many as
# learning_updates_omitted. 4,000 tokens is about 3,000 English words: roughly
# ten to twenty typical conclusions, while the prompt stays compact (ADR-014).
LEARNING_UPDATES_TOKEN_BUDGET = 4_000


def _model_visible_update(entry: Dict[str, Any]) -> Dict[str, Any]:
    """The fields of a learning-update context entry that the model may see."""
    return {
        field: entry[field]
        for field in _MODEL_VISIBLE_UPDATE_FIELDS
        if entry.get(field)
    }


def _model_visible_text(update: LearningUpdate) -> str:
    """An accepted update rendered the way the prompt shows it."""
    return str(_model_visible_update(update.as_context_entry()))


def model_facing_context(context: Dict[str, Any]) -> Dict[str, Any]:
    """Return a copy of chat context that is safe to render into a prompt.

    ``context["learning_updates"]`` entries carry record IDs (the chat-context
    response hands them to the UI). The model only needs their content, so the
    IDs are dropped and an instruction forbids citing internal records.
    The input is not mutated.
    """
    prepared = dict(context)
    updates = prepared.get("learning_updates")
    if not isinstance(updates, list):
        prepared.pop("learning_updates", None)
        return prepared
    visible = [
        _model_visible_update(item)
        for item in updates
        if isinstance(item, dict) and item.get("conclusion")
    ]
    if not visible:
        prepared.pop("learning_updates", None)
        return prepared
    prepared["learning_updates"] = visible
    prepared["learning_updates_instruction"] = LEARNING_UPDATES_INSTRUCTION
    return prepared


# Context keys that only the server may fill for a main-chat turn.
_SERVER_LEARNING_KEYS = ("learning_updates", "learning_updates_instruction")


def _created_timestamp(update: LearningUpdate) -> float:
    return update.created.timestamp() if update.created else float("-inf")


def fit_learning_updates_to_budget(
    updates: Sequence[LearningUpdate], budget_tokens: int
) -> Tuple[Tuple[LearningUpdate, ...], int]:
    """Keep the newest accepted updates that fit in ``budget_tokens``.

    Updates are taken newest first, by ``created``, with the later position in
    ``updates`` winning a tie, and kept while their running token total fits.
    The first update that does not fit ends the selection, so what is kept is
    always the most recent run of conclusions: an older, shorter one never takes
    the place of a newer one. Returns the kept updates in their input order
    (oldest first, the order the prompt lists them in) and how many were left
    out.
    """
    newest_first = sorted(
        range(len(updates)),
        key=lambda index: (_created_timestamp(updates[index]), index),
        reverse=True,
    )
    kept: Set[int] = set()
    used = 0
    for index in newest_first:
        used += token_count(_model_visible_text(updates[index]))
        if used > budget_tokens:
            break
        kept.add(index)
    selected = tuple(update for index, update in enumerate(updates) if index in kept)
    return selected, len(updates) - len(selected)


@dataclass(frozen=True)
class MainLearningContext:
    """The accepted learning updates that go with a main-chat turn."""

    updates: Tuple[LearningUpdate, ...] = ()
    # Accepted updates left out because LEARNING_UPDATES_TOKEN_BUDGET was full.
    omitted: int = 0

    def context_entries(self) -> List[Dict[str, Any]]:
        """The updates as ``learning_updates`` context entries, record IDs included."""
        return [update.as_context_entry() for update in self.updates]

    def model_text(self) -> str:
        """The updates as the model sees them, for token and character counts."""
        return "".join(_model_visible_text(update) for update in self.updates)


async def load_main_learning_context(
    session_id: str, notebook_id: Optional[str] = None
) -> MainLearningContext:
    """Load the accepted learning updates for a main chat session.

    This is the one place that decides which updates go with a main-chat turn:
    ``POST /chat/context`` returns its result for display and
    ``POST /chat/execute`` sends the same result to the model, so the two cannot
    disagree. The updates are the latest, included version of each aside on the
    journey whose main session is ``session_id``, cut to the newest ones that
    fit in LEARNING_UPDATES_TOKEN_BUDGET; an aside's own session has no journey
    and gets none. When ``notebook_id`` is given, a journey that belongs to
    another notebook contributes nothing.
    """
    journey = await LearningJourney.get_for_main_session(session_id)
    if journey is None:
        return MainLearningContext()
    if notebook_id is not None and journey.notebook != notebook_id:
        return MainLearningContext()
    accepted = await journey.get_updates(include_unmerged=False)
    updates, omitted = fit_learning_updates_to_budget(
        accepted, LEARNING_UPDATES_TOKEN_BUDGET
    )
    if omitted:
        logger.debug(
            f"Left {omitted} accepted learning update(s) out of {session_id}: "
            f"over the {LEARNING_UPDATES_TOKEN_BUDGET}-token budget"
        )
    return MainLearningContext(updates=updates, omitted=omitted)


def main_chat_model_context(
    context: Dict[str, Any], learning: MainLearningContext
) -> Dict[str, Any]:
    """Prompt-safe main-chat context carrying the server-loaded learning updates.

    Clients echo the context they got from ``POST /chat/context``, learning
    updates included. That copy is ignored: it can be stale (an aside resolved
    or excluded since) or edited, and the model must only see conclusions the
    learner accepted. The updates in ``learning`` take its place and then lose
    their record IDs in :func:`model_facing_context`. The input is not mutated.
    """
    prepared = dict(context)
    supplied = [key for key in _SERVER_LEARNING_KEYS if key in prepared]
    if supplied:
        logger.debug(
            f"Ignoring client-supplied {', '.join(supplied)} in the chat context; "
            "accepted learning updates are loaded on the server"
        )
        for key in supplied:
            del prepared[key]
    if learning.updates:
        prepared["learning_updates"] = learning.context_entries()
    return model_facing_context(prepared)


def normalize_record_id(table: str, record_id: str) -> str:
    """Ensure a record ID carries its table prefix (`table:id`)."""
    prefix = f"{table}:"
    return record_id if record_id.startswith(prefix) else f"{prefix}{record_id}"


async def get_source_or_404(source_id: str) -> Tuple[str, Source]:
    """Normalize a source ID and fetch the source, 404 if missing."""
    full_source_id = normalize_record_id("source", source_id)
    source = await Source.get(full_source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    return full_source_id, source


async def get_session_or_404(session_id: str) -> Tuple[str, ChatSession]:
    """Normalize a session ID and fetch the chat session, 404 if missing."""
    full_session_id = normalize_record_id("chat_session", session_id)
    session = await ChatSession.get(full_session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return full_session_id, session


async def get_verified_source_session(
    source_id: str, session_id: str
) -> Tuple[str, Source, str, ChatSession]:
    """Verify the source exists, the session exists, and the session refers to
    the source. Returns the normalized IDs plus both records."""
    full_source_id, source = await get_source_or_404(source_id)
    full_session_id, session = await get_session_or_404(session_id)

    relation_query = await repo_query(
        "SELECT * FROM refers_to WHERE in = $session_id AND out = $source_id",
        {
            "session_id": ensure_record_id(full_session_id),
            "source_id": ensure_record_id(full_source_id),
        },
    )
    if not relation_query:
        raise HTTPException(status_code=404, detail="Session not found for this source")

    return full_source_id, source, full_session_id, session


def extract_chat_messages(raw_messages: Iterable[Any]) -> List[ChatMessage]:
    """Convert LangGraph/LangChain state messages into `ChatMessage` models."""
    messages: List[ChatMessage] = []
    for msg in raw_messages:
        messages.append(
            ChatMessage(
                id=getattr(msg, "id", f"msg_{len(messages)}"),
                type=msg.type if hasattr(msg, "type") else "unknown",
                content=msg.content if hasattr(msg, "content") else str(msg),
                timestamp=None,  # LangChain messages don't have timestamps by default
            )
        )
    return messages
