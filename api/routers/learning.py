"""Learning journeys and isolated aside conversations."""

import asyncio
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

from fastapi import APIRouter, Query
from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig

from api.models import (
    CreateLearningAsideRequest,
    LearningAsideMessageResponse,
    LearningAsideResponse,
    LearningJourneyResponse,
    LearningJourneyResumeResponse,
    LearningSectionResponse,
    LearningUpdateResponse,
    ResolveLearningAsideRequest,
    SendLearningAsideMessageRequest,
    SyncLearningSectionsRequest,
    UpdateLearningAsideRequest,
    UpdateLearningSectionRequest,
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
)
from open_notebook.domain.notebook import ChatSession, Note, Notebook
from open_notebook.exceptions import InvalidInputError, NotFoundError
from open_notebook.graphs.chat import graph as chat_graph
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


def _update_response(update: LearningUpdate) -> LearningUpdateResponse:
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
        created=_timestamp(update.created),
        updated=_timestamp(update.updated),
    )


async def _aside_response(aside: LearningAside) -> LearningAsideResponse:
    messages = [
        LearningAsideMessageResponse(
            id=str(getattr(message, "id", "") or ""),
            type=str(getattr(message, "type", "unknown")),
            content=extract_text_content(getattr(message, "content", "")),
            timestamp=None,
        )
        for message in await _raw_session_messages(aside.chat_session)
    ]
    updates = [_update_response(update) for update in await aside.get_updates()]
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
        updates=updates,
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


async def _journey_response(journey: LearningJourney) -> LearningJourneyResponse:
    asides = [
        await _aside_response(aside)
        for aside in await journey.get_asides(include_discarded=True)
    ]
    updates = [_update_response(update) for update in await journey.get_updates()]
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
):
    full_session_id, _, _ = await _verify_notebook_session(notebook_id, main_session_id)
    journey = await LearningJourney.get_for_main_session(full_session_id)
    return await _journey_response(journey) if journey else None


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
        update.conclusion for update in response.updates if update.include_in_main
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
    aside = await _get_aside(aside_id)
    update = request.model_dump(exclude_unset=True)
    if "title" in update:
        aside.title = update["title"]
    if "status" in update:
        aside.status = update["status"]
    await aside.save()

    journey = await LearningJourney.get(aside.journey)
    if aside.status == "active":
        journey.active_session = aside.chat_session
    elif journey.active_session == aside.chat_session:
        journey.active_session = aside.parent_session
    await journey.save()
    return await _aside_response(aside)


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

    parent_transcript = "\n\n".join(
        f"{item.get('role', 'unknown').upper()}: {item.get('content', '')}"
        for item in aside.context_snapshot
    )
    context = model_facing_context(request.context)
    context["learning_aside"] = {
        "title": aside.title,
        "anchor": aside.anchor.model_dump(),
        "parent_conversation_at_branch": parent_transcript,
        "instruction": (
            "Answer this isolated learning aside. Preserve source citations and "
            "focus on the prerequisite or tangent without redirecting the main path. "
            + INTERNAL_ID_INSTRUCTION
        ),
    }
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
    if aside.status != "active":
        aside.status = "active"
        await aside.save()
    journey.active_session = aside.chat_session
    await journey.save()
    return await _aside_response(aside)


@router.post("/asides/{aside_id}/resolve", response_model=LearningAsideResponse)
async def resolve_aside(aside_id: str, request: ResolveLearningAsideRequest):
    aside = await _get_aside(aside_id)
    if aside.status == "discarded":
        raise InvalidInputError("Discarded asides cannot be resolved")
    journey = await LearningJourney.get(aside.journey)
    existing_updates = await aside.get_updates()

    saved_note_id: Optional[str] = None
    if request.save_as_note:
        note = Note(
            title=f"Learning aside: {aside.title}",
            content=request.conclusion,
            note_type="ai",
        )
        await note.save()
        await note.add_to_notebook(journey.notebook)
        saved_note_id = note.id

    update = LearningUpdate(
        aside=aside.id or "",
        conclusion=request.conclusion,
        relevance=request.relevance,
        open_questions=request.open_questions,
        citations=request.citations,
        include_in_main=request.include_in_main,
        saved_note=saved_note_id,
        version=len(existing_updates) + 1,
    )
    await update.save()
    aside.status = "resolved"
    await aside.save()
    journey.active_session = aside.parent_session
    await journey.save()
    return await _aside_response(aside)
