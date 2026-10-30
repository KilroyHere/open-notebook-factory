"""Learning journeys and isolated aside conversations."""

import asyncio
import re
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

from fastapi import APIRouter, Query
from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig
from loguru import logger

from api.models import (
    CreateLearningAsideRequest,
    DraftLearningResolutionRequest,
    LearningAsideMessageResponse,
    LearningAsideResponse,
    LearningJourneyResponse,
    LearningJourneyResumeResponse,
    LearningResolutionDraftResponse,
    LearningSectionResponse,
    LearningUpdateResponse,
    ResolveLearningAsideRequest,
    SendLearningAsideMessageRequest,
    SyncLearningSectionsRequest,
    UpdateLearningAsideRequest,
    UpdateLearningSectionRequest,
    UpdateLearningUpdateRequest,
)
from api.routers._chat_shared import (
    INTERNAL_ID_INSTRUCTION,
    model_facing_context,
    normalize_record_id,
)
from open_notebook.database.repository import ensure_record_id, repo_query
from open_notebook.domain.learning import (
    AsideAnchor,
    LearningAside,
    LearningJourney,
    LearningSection,
    LearningUpdate,
    latest_update_versions,
)
from open_notebook.domain.notebook import (
    LEARNING_ASIDE_SESSION_KIND,
    ChatSession,
    Note,
    Notebook,
)
from open_notebook.exceptions import InvalidInputError, NotFoundError
from open_notebook.graphs.chat import graph as chat_graph
from open_notebook.graphs.learning_resolution import draft_learning_resolution
from open_notebook.utils.graph_utils import invoke_chat_turn
from open_notebook.utils.text_utils import extract_text_content

router = APIRouter(prefix="/learning")


def _timestamp(value: Any) -> str:
    return str(value) if value is not None else ""


async def _verify_notebook_session(
    notebook_id: str, session_id: str
) -> Tuple[str, Notebook, ChatSession]:
    full_notebook_id = normalize_record_id("notebook", notebook_id)
    full_session_id = normalize_record_id("chat_session", session_id)
    notebook = await Notebook.get(full_notebook_id)
    session = await ChatSession.get(full_session_id)
    relation = await repo_query(
        "SELECT id FROM refers_to WHERE in = $session_id AND out = $notebook LIMIT 1",
        {
            "session_id": ensure_record_id(full_session_id),
            "notebook": ensure_record_id(full_notebook_id),
        },
    )
    if not relation:
        raise NotFoundError("Chat session not found in this notebook")
    return full_session_id, notebook, session


async def _raw_session_messages(session_id: str) -> List[Any]:
    state = await asyncio.to_thread(
        chat_graph.get_state,
        config=RunnableConfig(configurable={"thread_id": session_id}),
    )
    if not state or not state.values:
        return []
    return list(state.values.get("messages", []))


async def _snapshot_parent_context(
    session_id: str, anchor: AsideAnchor
) -> List[Dict[str, str]]:
    snapshot: List[Dict[str, str]] = []
    found_anchor = anchor.message_id is None
    for message in await _raw_session_messages(session_id):
        message_id = str(getattr(message, "id", "") or "")
        snapshot.append(
            {
                "id": message_id,
                "role": str(getattr(message, "type", "unknown")),
                "content": extract_text_content(getattr(message, "content", "")),
            }
        )
        if anchor.message_id and message_id == anchor.message_id:
            found_anchor = True
            break
    if not found_anchor:
        raise InvalidInputError("The selected anchor message is not in this session")
    return snapshot[-100:]


def _update_response(
    update: LearningUpdate, superseded: bool = False
) -> LearningUpdateResponse:
    return LearningUpdateResponse(
        id=update.id or "",
        aside_id=update.aside,
        conclusion=update.conclusion,
        relevance=update.relevance,
        open_questions=update.open_questions,
        citations=update.citations,
        include_in_main=update.include_in_main,
        saved_note_id=update.saved_note,
        applied_message_id=update.applied_message_id,
        version=update.version,
        superseded=superseded,
        created=_timestamp(update.created),
        updated=_timestamp(update.updated),
    )


def _update_responses(updates: List[LearningUpdate]) -> List[LearningUpdateResponse]:
    current = {id(update) for update in latest_update_versions(updates)}
    return [
        _update_response(update, superseded=id(update) not in current)
        for update in updates
    ]


async def _aside_response(
    aside: LearningAside,
    *,
    include_messages: bool = True,
    updates: Optional[List[LearningUpdate]] = None,
) -> LearningAsideResponse:
    """Serialize an aside.

    ``include_messages=False`` skips the LangGraph checkpoint read and returns
    ``messages=[]``: the journey listing only needs aside metadata, and the
    aside detail endpoint is the source of a transcript. ``updates`` lets a
    caller that already loaded them avoid a query per aside.
    """
    messages = (
        [
            LearningAsideMessageResponse(
                id=str(getattr(message, "id", "") or ""),
                type=str(getattr(message, "type", "unknown")),
                content=extract_text_content(getattr(message, "content", "")),
                timestamp=None,
            )
            for message in await _raw_session_messages(aside.chat_session)
        ]
        if include_messages
        else []
    )
    if updates is None:
        updates = await aside.get_updates()
    return LearningAsideResponse(
        id=aside.id or "",
        journey_id=aside.journey,
        parent_aside_id=aside.parent_aside,
        parent_session_id=aside.parent_session,
        chat_session_id=aside.chat_session,
        title=aside.title,
        status=aside.status,
        anchor=aside.anchor.model_dump(),
        messages=messages,
        updates=_update_responses(updates),
        created=_timestamp(aside.created),
        updated=_timestamp(aside.updated),
    )


def _section_response(section: LearningSection) -> LearningSectionResponse:
    return LearningSectionResponse(
        id=section.id or "",
        journey_id=section.journey,
        title=section.title,
        pinned=section.pinned,
        start_message_id=section.start_message_id,
        created=_timestamp(section.created),
        updated=_timestamp(section.updated),
    )


async def _journey_response(
    journey: LearningJourney, include_messages: bool = False
) -> LearningJourneyResponse:
    """Serialize a journey; aside transcripts are only loaded on request."""
    all_updates = await journey.get_updates()
    updates_by_aside: Dict[str, List[LearningUpdate]] = {}
    for update in all_updates:
        updates_by_aside.setdefault(update.aside, []).append(update)
    asides = []
    for aside in await journey.get_asides(include_discarded=True):
        aside_updates = sorted(
            updates_by_aside.get(aside.id or "", []),
            key=lambda update: update.version,
        )
        asides.append(
            await _aside_response(
                aside, include_messages=include_messages, updates=aside_updates
            )
        )
    updates = _update_responses(all_updates)
    sections = [
        _section_response(section)
        for section in await LearningSection.get_for_journey(journey.id or "")
    ]
    return LearningJourneyResponse(
        id=journey.id or "",
        notebook_id=journey.notebook,
        main_session_id=journey.main_session,
        active_session_id=journey.active_session,
        objective=journey.objective,
        status=journey.status,
        asides=asides,
        updates=updates,
        sections=sections,
        created=_timestamp(journey.created),
        updated=_timestamp(journey.updated),
    )


async def _get_aside(aside_id: str) -> LearningAside:
    return await LearningAside.get(normalize_record_id("learning_aside", aside_id))


@router.get("/journeys", response_model=Optional[LearningJourneyResponse])
async def get_journey(
    notebook_id: str = Query(...),
    main_session_id: str = Query(...),
    include_messages: bool = Query(
        False,
        description=(
            "Load every aside's transcript. Off by default: asides are listed "
            "with messages=[]; GET /learning/asides/{id} returns one transcript"
        ),
    ),
):
    full_session_id, _, _ = await _verify_notebook_session(notebook_id, main_session_id)
    journey = await LearningJourney.get_for_main_session(full_session_id)
    if not journey:
        return None
    return await _journey_response(journey, include_messages=include_messages)


@router.get("/journeys/resume", response_model=LearningJourneyResumeResponse)
async def get_journey_resume(
    notebook_id: str = Query(...),
    main_session_id: str = Query(...),
):
    full_session_id, _, _ = await _verify_notebook_session(notebook_id, main_session_id)
    journey = await LearningJourney.get_for_main_session(full_session_id)
    if not journey:
        return LearningJourneyResumeResponse()

    response = await _journey_response(journey)
    open_asides = [
        aside for aside in response.asides if aside.status in {"active", "parked"}
    ]
    active_aside = next(
        (
            aside
            for aside in open_asides
            if aside.chat_session_id == response.active_session_id
        ),
        open_asides[-1] if open_asides else None,
    )
    accepted_findings = [
        update.conclusion
        for update in response.updates
        if update.include_in_main and not update.superseded
    ]
    current_point: Optional[str]
    if active_aside:
        recommended_action = "resume_aside"
        current_point = active_aside.title
    elif accepted_findings:
        recommended_action = "continue_main"
        current_point = response.objective
    else:
        recommended_action = "start_aside"
        current_point = response.objective

    return LearningJourneyResumeResponse(
        journey=response,
        current_point=current_point,
        accepted_findings=accepted_findings,
        open_aside_ids=[aside.id for aside in open_asides],
        recommended_aside_id=active_aside.id if active_aside else None,
        recommended_action=recommended_action,
    )


@router.post("/sections/sync", response_model=List[LearningSectionResponse])
async def sync_sections(request: SyncLearningSectionsRequest):
    full_session_id, _, _ = await _verify_notebook_session(
        request.notebook_id, request.main_session_id
    )
    journey = await LearningJourney.get_or_create(
        normalize_record_id("notebook", request.notebook_id),
        full_session_id,
    )
    sections = await LearningSection.ensure_for_turns(
        journey.id or "",
        [(item.start_message_id, item.title) for item in request.sections],
    )
    return [_section_response(section) for section in sections]


@router.patch("/sections/{section_id}", response_model=LearningSectionResponse)
async def update_section(section_id: str, request: UpdateLearningSectionRequest):
    section = await LearningSection.get(
        normalize_record_id("learning_section", section_id)
    )
    update = request.model_dump(exclude_unset=True)
    if "title" in update:
        section.title = update["title"]
    if "pinned" in update:
        section.pinned = update["pinned"]
    await section.save()
    return _section_response(section)


@router.post("/asides", response_model=LearningAsideResponse)
async def create_aside(request: CreateLearningAsideRequest):
    parent_session_id, _, parent_session = await _verify_notebook_session(
        request.notebook_id, request.parent_session_id
    )
    anchor = AsideAnchor(**request.anchor.model_dump())
    context_snapshot = await _snapshot_parent_context(parent_session_id, anchor)

    parent_aside: Optional[LearningAside] = None
    if request.parent_aside_id:
        parent_aside = await _get_aside(request.parent_aside_id)
        if parent_aside.chat_session != parent_session_id:
            raise InvalidInputError(
                "Parent aside does not belong to the selected chat session"
            )
        if parent_aside.status == "discarded":
            raise InvalidInputError("Discarded asides cannot parent a new dive")
    else:
        parent_aside = await LearningAside.get_for_chat_session(parent_session_id)

    if parent_aside:
        journey = await LearningJourney.get(parent_aside.journey)
        if journey.notebook != normalize_record_id("notebook", request.notebook_id):
            raise InvalidInputError("Parent aside belongs to another notebook")
    else:
        journey = await LearningJourney.get_or_create(
            normalize_record_id("notebook", request.notebook_id),
            parent_session_id,
            request.objective,
        )

    title = (request.title or anchor.content[:80]).strip()
    child_session = ChatSession(
        title=title,
        model_override=(
            request.model_override
            if request.model_override is not None
            else parent_session.model_override
        ),
        # Keeps the aside's session out of the notebook's session list.
        kind=LEARNING_ASIDE_SESSION_KIND,
    )
    await child_session.save()
    await child_session.relate_to_notebook(
        normalize_record_id("notebook", request.notebook_id)
    )

    aside = LearningAside(
        journey=journey.id or "",
        parent_aside=parent_aside.id if parent_aside else None,
        parent_session=parent_session_id,
        chat_session=child_session.id or "",
        title=title,
        anchor=anchor,
        context_snapshot=context_snapshot,
    )
    try:
        await aside.save()
    except Exception:
        await child_session.delete()
        raise

    journey.active_session = child_session.id
    await journey.save()
    return await _aside_response(aside)


@router.get("/asides/{aside_id}", response_model=LearningAsideResponse)
async def get_aside(aside_id: str):
    return await _aside_response(await _get_aside(aside_id))


@router.patch("/asides/{aside_id}", response_model=LearningAsideResponse)
async def update_aside(aside_id: str, request: UpdateLearningAsideRequest):
    """Rename an aside, or park, reopen or discard it.

    Only active and parked asides change status here (400 otherwise): a
    resolved aside keeps its status and a discarded one stays discarded.
    """
    aside = await _get_aside(aside_id)
    update = request.model_dump(exclude_unset=True)
    if "status" in update:
        aside.change_status(update["status"])
    if "title" in update:
        aside.title = update["title"]
    await aside.save()

    journey = await LearningJourney.get(aside.journey)
    if aside.status == "active":
        journey.active_session = aside.chat_session
    elif journey.active_session == aside.chat_session:
        journey.active_session = aside.parent_session
    await journey.save()
    return await _aside_response(aside)


@router.patch("/updates/{update_id}", response_model=LearningUpdateResponse)
async def update_learning_update(update_id: str, request: UpdateLearningUpdateRequest):
    """Include an accepted conclusion in the main chat, or leave it out.

    The version is changed in place; no new version is stored. Only the latest
    version of an aside reaches main context, so a superseded version is
    rejected with 400. An unknown ID is a 404.
    """
    update = await LearningUpdate.get(normalize_record_id("learning_update", update_id))
    await update.set_include_in_main(request.include_in_main)
    return _update_response(update)


# Bounds for the ancestry summary a nested dive receives. Only the immediate
# parent's transcript is sent in full (its branch snapshot); the main thread and
# outer asides are summarized so deep nesting cannot grow the prompt unbounded.
MAX_ANCESTOR_DEPTH = 8
MAIN_EXCERPT_MESSAGES = 12
MAIN_EXCERPT_CHARS = 6_000
ANCESTOR_FIELD_CHARS = 600
LEARNING_PATH_CHARS = 16_000


def _clip(text: str, limit: int) -> str:
    text = text.strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "\u2026"


def _clip_tail(text: str, limit: int) -> str:
    """Clip from the front, keeping the end (the part nearest the branch)."""
    text = text.strip()
    return text if len(text) <= limit else "\u2026" + text[-(limit - 1) :].lstrip()


# A document ID the model may cite (the chat prompt's citation format).
_CITABLE_DOCUMENT_ID = re.compile(r"(?:source_insight|source|note|insight):\w+")


def _model_visible_anchor(anchor: AsideAnchor) -> Dict[str, str]:
    """The parts of an aside's anchor that the model may see.

    ``message_id`` names a main-chat checkpoint message and ``locator`` is the
    UI's way back to it; both are internal, and the model would cite them.
    ``source_id`` stays only when it is a document ID the model may cite.
    """
    visible = {"type": anchor.type, "content": anchor.content}
    if anchor.source_id and _CITABLE_DOCUMENT_ID.fullmatch(anchor.source_id):
        visible["source_id"] = anchor.source_id
    return visible


def _format_transcript(snapshot: List[Dict[str, str]]) -> str:
    return "\n\n".join(
        f"{item.get('role', 'unknown').upper()}: {item.get('content', '')}"
        for item in snapshot
    )


async def _aside_ancestors(aside: LearningAside) -> List[LearningAside]:
    """Return the asides this one branched from, outermost first."""
    ancestors: List[LearningAside] = []
    seen = {aside.id}
    current = aside
    while current.parent_aside and len(ancestors) < MAX_ANCESTOR_DEPTH:
        if current.parent_aside in seen:
            break
        try:
            parent = await LearningAside.get(current.parent_aside)
        except NotFoundError:
            break
        seen.add(parent.id)
        ancestors.append(parent)
        current = parent
    ancestors.reverse()
    return ancestors


async def _learning_path(aside: LearningAside) -> Optional[str]:
    """Compact ancestry for a nested dive, or None for a top-level aside.

    It holds the main-thread excerpt captured when the outermost aside branched,
    then each ancestor's title, anchor and latest conclusion. Transcripts of
    ancestors other than the immediate parent are never included.
    """
    ancestors = await _aside_ancestors(aside)
    if not ancestors:
        return None

    parts: List[str] = []
    root = ancestors[0]
    if root.parent_aside is None and root.context_snapshot:
        excerpt = _clip_tail(
            _format_transcript(root.context_snapshot[-MAIN_EXCERPT_MESSAGES:]),
            MAIN_EXCERPT_CHARS,
        )
        parts.append(f"Main thread at the first branch (excerpt):\n{excerpt}")

    for depth, ancestor in enumerate(ancestors, start=1):
        lines = [
            f"Aside {depth}: {_clip(ancestor.title, 200)}",
            f"Branched from: {_clip(ancestor.anchor.content, ANCESTOR_FIELD_CHARS)}",
        ]
        updates = await ancestor.get_updates()
        if updates:
            latest = max(updates, key=lambda update: update.version)
            lines.append(
                f"Conclusion: {_clip(latest.conclusion, ANCESTOR_FIELD_CHARS)}"
            )
        else:
            lines.append(f"Status: {ancestor.status}, no conclusion yet")
        parts.append("\n".join(lines))

    # Over the bound, keep the innermost ancestors: they matter most here.
    return _clip_tail("\n\n".join(parts), LEARNING_PATH_CHARS)


@router.post("/asides/{aside_id}/messages", response_model=LearningAsideResponse)
async def send_aside_message(aside_id: str, request: SendLearningAsideMessageRequest):
    aside = await _get_aside(aside_id)
    if aside.status == "discarded":
        raise InvalidInputError("Discarded asides cannot receive new messages")

    journey = await LearningJourney.get(aside.journey)
    session = await ChatSession.get(aside.chat_session)
    notebook = await Notebook.get(journey.notebook)
    current_state = await asyncio.to_thread(
        chat_graph.get_state,
        config=RunnableConfig(configurable={"thread_id": aside.chat_session}),
    )
    state_values = dict(current_state.values) if current_state else {}
    state_values["messages"] = list(state_values.get("messages", []))

    parent_transcript = _format_transcript(aside.context_snapshot)
    context = model_facing_context(request.context)
    context["learning_aside"] = {
        "title": aside.title,
        "anchor": _model_visible_anchor(aside.anchor),
        "parent_conversation_at_branch": parent_transcript,
        "instruction": (
            "Answer this isolated learning aside. Preserve source citations and "
            "focus on the prerequisite or tangent without redirecting the main path. "
            + INTERNAL_ID_INSTRUCTION
        ),
    }
    learning_path = await _learning_path(aside)
    if learning_path:
        context["learning_aside"]["learning_path"] = learning_path
        context["learning_aside"]["instruction"] += (
            " This is a nested dive: learning_path summarizes the main thread "
            "and each aside it branched from, outermost first. Use it to keep "
            "the answer consistent with what the learner already settled."
        )
    state_values["context"] = context
    state_values["notebook"] = notebook
    model_override = (
        request.model_override
        if request.model_override is not None
        else session.model_override
    )
    state_values["model_override"] = model_override

    user_message = HumanMessage(content=request.message, id=str(uuid4()))
    state_values["messages"].append(user_message)
    result = await asyncio.to_thread(
        invoke_chat_turn,
        chat_graph,
        state_values,
        RunnableConfig(
            configurable={
                "thread_id": aside.chat_session,
                "model_id": model_override,
            }
        ),
        user_message,
    )
    # Ensure the graph completed before mutating durable navigation state.
    if not result.get("messages"):
        raise InvalidInputError("Aside chat returned no messages")

    await session.save()
    # A follow-up on a resolved aside is a clarifying question, not a reopen:
    # it stays resolved (its accepted update is unchanged) and navigation stays
    # on the parent. Re-resolving is the explicit way to change the conclusion.
    # A parked aside is resumed by writing to it.
    if aside.status != "resolved":
        if aside.status != "active":
            aside.status = "active"
            await aside.save()
        journey.active_session = aside.chat_session
        await journey.save()
    return await _aside_response(aside)


@router.post(
    "/asides/{aside_id}/draft-resolution",
    response_model=LearningResolutionDraftResponse,
)
async def draft_aside_resolution(
    aside_id: str, request: Optional[DraftLearningResolutionRequest] = None
):
    """Draft an editable conclusion, relevance and open questions. Saves nothing."""
    aside = await _get_aside(aside_id)
    if aside.status == "discarded":
        raise InvalidInputError("Discarded asides cannot be resolved")

    raw_messages = await _raw_session_messages(aside.chat_session)
    transcript = [
        {
            "role": str(getattr(message, "type", "unknown")),
            "content": extract_text_content(getattr(message, "content", "")),
        }
        for message in raw_messages
    ]
    if not any(turn["role"] == "ai" and turn["content"].strip() for turn in transcript):
        raise InvalidInputError("Ask a question in this aside before drafting")

    session = await ChatSession.get(aside.chat_session)
    model_override = (
        request.model_override
        if request is not None and request.model_override is not None
        else session.model_override
    )
    internal_ids = [
        aside.id or "",
        aside.journey,
        aside.parent_aside or "",
        aside.parent_session,
        aside.chat_session,
        aside.anchor.message_id or "",
        *(str(getattr(message, "id", "") or "") for message in raw_messages),
        *(item.get("id", "") for item in aside.context_snapshot),
        *(update.id or "" for update in await aside.get_updates()),
    ]
    draft = await draft_learning_resolution(
        title=aside.title,
        anchor=aside.anchor.content,
        parent_context=aside.context_snapshot,
        transcript=transcript,
        model_id=model_override,
        internal_ids=[value for value in internal_ids if value],
    )
    return LearningResolutionDraftResponse(**draft.model_dump())


async def _save_resolution_note(
    update: LearningUpdate, aside: LearningAside, notebook_id: str
) -> None:
    """Save a stored resolution's conclusion as a notebook note.

    If any step fails, the note (when it was created) and ``update`` are
    deleted again before the error is raised.
    """
    note = Note(
        title=f"Learning aside: {aside.title}",
        content=update.conclusion,
        note_type="ai",
    )
    try:
        await note.save()
        await note.add_to_notebook(notebook_id)
        await update.set_saved_note(note.id or "")
    except Exception:
        for record in (note, update):
            if not record.id:
                continue
            try:
                await record.delete()
            except Exception:
                logger.exception(
                    f"Could not remove {record.id} after its resolution failed"
                )
        raise


@router.post("/asides/{aside_id}/resolve", response_model=LearningAsideResponse)
async def resolve_aside(aside_id: str, request: ResolveLearningAsideRequest):
    """Store an approved conclusion as the aside's next version.

    The version is stored first, so the unique (aside, version) index settles
    concurrent resolutions before anything else is written. With
    ``save_as_note`` the note follows; if it cannot be created, linked to the
    notebook or recorded on the version, the note and the version are deleted
    again and the error is raised. Nothing is then left behind: the aside
    keeps its status and a retry starts clean.
    """
    aside = await _get_aside(aside_id)
    if aside.status == "discarded":
        raise InvalidInputError("Discarded asides cannot be resolved")
    journey = await LearningJourney.get(aside.journey)

    update = LearningUpdate(
        aside=aside.id or "",
        conclusion=request.conclusion,
        relevance=request.relevance,
        open_questions=request.open_questions,
        citations=request.citations,
        include_in_main=request.include_in_main,
    )
    await update.save_as_next_version()
    if request.save_as_note:
        await _save_resolution_note(update, aside, journey.notebook)

    aside.status = "resolved"
    await aside.save()
    journey.active_session = aside.parent_session
    await journey.save()
    return await _aside_response(aside)
