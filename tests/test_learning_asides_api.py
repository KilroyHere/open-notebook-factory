"""API coverage for learning-aside lifecycle and context integration."""

from contextlib import contextmanager
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from api.models import (
    LearningAsideResponse,
    LearningJourneyResponse,
    UpdateLearningAsideRequest,
    UpdateLearningSectionRequest,
)
from api.routers.chat import _mark_learning_updates_applied
from open_notebook.domain.learning import (
    AsideAnchor,
    LearningAside,
    LearningJourney,
    LearningSection,
    LearningUpdate,
)

NOW = datetime(2026, 10, 28, tzinfo=timezone.utc)


@pytest.fixture
def client():
    from api.main import app

    return TestClient(app)


def _journey(**overrides):
    values = {
        "id": "learning_journey:journey",
        "notebook": "notebook:one",
        "main_session": "chat_session:main",
        "active_session": "chat_session:main",
        "objective": "Understand the ELBO",
        "status": "active",
        "created": NOW,
        "updated": NOW,
    }
    values.update(overrides)
    return LearningJourney(**values)


def _aside(**overrides):
    values = {
        "id": "learning_aside:aside",
        "journey": "learning_journey:journey",
        "parent_session": "chat_session:main",
        "chat_session": "chat_session:child",
        "title": "Why does Jensen's inequality apply?",
        "status": "active",
        "anchor": AsideAnchor(
            type="message",
            message_id="message-1",
            content="The ELBO follows from Jensen's inequality.",
        ),
        "context_snapshot": [],
        "created": NOW,
        "updated": NOW,
    }
    values.update(overrides)
    return LearningAside(**values)


def _aside_response(aside=None):
    aside = aside or _aside()
    return LearningAsideResponse(
        id=aside.id or "",
        journey_id=aside.journey,
        parent_aside_id=aside.parent_aside,
        parent_session_id=aside.parent_session,
        chat_session_id=aside.chat_session,
        title=aside.title,
        status=aside.status,
        anchor=aside.anchor.model_dump(),
        messages=[],
        updates=[],
        created=str(aside.created),
        updated=str(aside.updated),
    )


@pytest.mark.asyncio
async def test_create_aside_persists_child_session_and_journey_navigation(client):
    journey = _journey()
    parent_session = SimpleNamespace(model_override="model:parent")
    saved = {}

    async def save_session(session):
        session.id = "chat_session:child"
        session.created = NOW
        session.updated = NOW
        saved["session"] = session

    async def save_aside(aside):
        aside.id = "learning_aside:aside"
        aside.created = NOW
        aside.updated = NOW

    with (
        patch(
            "api.routers.learning._verify_notebook_session",
            new_callable=AsyncMock,
            return_value=(
                "chat_session:main",
                SimpleNamespace(id="notebook:one"),
                parent_session,
            ),
        ),
        patch(
            "api.routers.learning._snapshot_parent_context",
            new_callable=AsyncMock,
            return_value=[{"id": "message-1", "role": "ai", "content": "anchor"}],
        ),
        patch(
            "api.routers.learning.LearningAside.get_for_chat_session",
            new_callable=AsyncMock,
            return_value=None,
        ),
        patch(
            "api.routers.learning.LearningJourney.get_or_create",
            new_callable=AsyncMock,
            return_value=journey,
        ),
        patch(
            "api.routers.learning.ChatSession.save",
            new=save_session,
        ),
        patch(
            "api.routers.learning.ChatSession.relate_to_notebook",
            new_callable=AsyncMock,
        ) as relate,
        patch(
            "api.routers.learning.LearningAside.save",
            new=save_aside,
        ),
        patch(
            "api.routers.learning.LearningJourney.save", new_callable=AsyncMock
        ) as save_journey,
        patch(
            "api.routers.learning._aside_response",
            new_callable=AsyncMock,
            side_effect=lambda aside: _aside_response(aside),
        ),
    ):
        response = client.post(
            "/api/learning/asides",
            json={
                "notebook_id": "notebook:one",
                "parent_session_id": "chat_session:main",
                "title": "Jensen's inequality",
                "anchor": {
                    "type": "message",
                    "message_id": "message-1",
                    "content": "The ELBO follows from Jensen's inequality.",
                },
            },
        )

    assert response.status_code == 200
    assert response.json()["chat_session_id"] == "chat_session:child"
    assert response.json()["status"] == "active"
    assert journey.active_session == "chat_session:child"
    # The child session is marked so the notebook's session list hides it.
    assert saved["session"].kind == "learning_aside"
    assert saved["session"].model_override == "model:parent"
    relate.assert_awaited_once_with("notebook:one")
    save_journey.assert_awaited_once()


@pytest.mark.parametrize(
    ("failing_step", "cleanup_fails"),
    [
        ("api.routers.learning.ChatSession.relate_to_notebook", False),
        ("api.routers.learning.LearningAside.save", False),
        # The original error still surfaces when the cleanup fails too.
        ("api.routers.learning.ChatSession.relate_to_notebook", True),
        ("api.routers.learning.LearningAside.save", True),
    ],
    ids=[
        "relate-fails",
        "aside-save-fails",
        "relate-and-cleanup-fail",
        "aside-save-and-cleanup-fail",
    ],
)
def test_failed_aside_create_removes_its_child_session(
    client, failing_step, cleanup_fails
):
    from open_notebook.exceptions import DatabaseOperationError

    async def save_session(session):
        session.id = "chat_session:child"
        session.created = NOW
        session.updated = NOW

    patches = {
        "api.routers.learning.ChatSession.relate_to_notebook": AsyncMock(),
        "api.routers.learning.LearningAside.save": AsyncMock(),
    }
    patches[failing_step] = AsyncMock(
        side_effect=DatabaseOperationError("The database is unavailable")
    )
    delete = AsyncMock(
        side_effect=RuntimeError("Failed to delete record") if cleanup_fails else None
    )
    with (
        patch(
            "api.routers.learning._verify_notebook_session",
            new_callable=AsyncMock,
            return_value=(
                "chat_session:main",
                SimpleNamespace(id="notebook:one"),
                SimpleNamespace(model_override=None),
            ),
        ),
        patch(
            "api.routers.learning._snapshot_parent_context",
            new_callable=AsyncMock,
            return_value=[],
        ),
        patch(
            "api.routers.learning.LearningAside.get_for_chat_session",
            new_callable=AsyncMock,
            return_value=None,
        ),
        patch(
            "api.routers.learning.LearningJourney.get_or_create",
            new_callable=AsyncMock,
            return_value=_journey(),
        ),
        patch("api.routers.learning.ChatSession.save", new=save_session),
        patch("api.routers.learning.ChatSession.delete", new=delete),
        patch(
            "api.routers.learning.ChatSession.relate_to_notebook",
            new=patches["api.routers.learning.ChatSession.relate_to_notebook"],
        ),
        patch(
            "api.routers.learning.LearningAside.save",
            new=patches["api.routers.learning.LearningAside.save"],
        ),
        patch(
            "api.routers.learning.LearningJourney.save", new_callable=AsyncMock
        ) as save_journey,
    ):
        response = client.post(
            "/api/learning/asides",
            json={
                "notebook_id": "notebook:one",
                "parent_session_id": "chat_session:main",
                "anchor": {"type": "message", "content": "Why Jensen?"},
            },
        )

    assert response.status_code == 500
    assert response.json()["detail"] == "The database is unavailable"
    delete.assert_awaited_once()
    save_journey.assert_not_called()


@pytest.mark.parametrize(
    ("url", "body", "parent_patch", "relate_patch"),
    [
        (
            "/api/chat/sessions",
            {"notebook_id": "notebook:one", "title": "Main"},
            "api.routers.chat.Notebook.get",
            "api.routers.chat.ChatSession.relate_to_notebook",
        ),
        (
            "/api/sources/paper/chat/sessions",
            {"source_id": "source:paper", "title": "Source chat"},
            "api.routers._chat_shared.Source.get",
            "api.routers.source_chat.ChatSession.relate",
        ),
    ],
    ids=["notebook-chat", "source-chat"],
)
def test_other_chat_sessions_stay_visible(
    client, url, body, parent_patch, relate_patch
):
    saved = {}

    async def save_session(session):
        session.id = "chat_session:new"
        session.created = NOW
        session.updated = NOW
        saved["session"] = session

    with (
        patch(parent_patch, new_callable=AsyncMock, return_value=SimpleNamespace()),
        patch("open_notebook.domain.notebook.ChatSession.save", new=save_session),
        patch(relate_patch, new_callable=AsyncMock),
    ):
        response = client.post(url, json=body)

    assert response.status_code == 200
    assert saved["session"].kind == "chat"


@pytest.mark.asyncio
async def test_create_nested_aside_stays_on_the_parent_journey(client):
    journey = _journey()
    parent = _aside(
        id="learning_aside:parent",
        chat_session="chat_session:parent-dive",
        parent_session="chat_session:main",
    )
    parent_session = SimpleNamespace(model_override="model:parent")

    async def save_session(session):
        session.id = "chat_session:nested"
        session.created = NOW
        session.updated = NOW

    saved = {}

    async def save_aside(aside):
        aside.id = "learning_aside:nested"
        aside.created = NOW
        aside.updated = NOW
        saved["aside"] = aside

    with (
        patch(
            "api.routers.learning._verify_notebook_session",
            new_callable=AsyncMock,
            return_value=(
                "chat_session:parent-dive",
                SimpleNamespace(id="notebook:one"),
                parent_session,
            ),
        ),
        patch(
            "api.routers.learning._snapshot_parent_context",
            new_callable=AsyncMock,
            return_value=[],
        ),
        patch(
            "api.routers.learning._get_aside",
            new_callable=AsyncMock,
            return_value=parent,
        ),
        patch(
            "api.routers.learning.LearningJourney.get",
            new_callable=AsyncMock,
            return_value=journey,
        ),
        patch(
            "api.routers.learning.LearningJourney.get_or_create",
            new_callable=AsyncMock,
        ) as get_or_create,
        patch(
            "api.routers.learning.LearningAside.get_for_chat_session",
            new_callable=AsyncMock,
        ) as get_for_session,
        patch("api.routers.learning.ChatSession.save", new=save_session),
        patch(
            "api.routers.learning.ChatSession.relate_to_notebook",
            new_callable=AsyncMock,
        ),
        patch("api.routers.learning.LearningAside.save", new=save_aside),
        patch("api.routers.learning.LearningJourney.save", new_callable=AsyncMock),
        patch(
            "api.routers.learning._aside_response",
            new_callable=AsyncMock,
            side_effect=lambda aside: _aside_response(aside),
        ),
    ):
        response = client.post(
            "/api/learning/asides",
            json={
                "notebook_id": "notebook:one",
                "parent_session_id": "chat_session:parent-dive",
                "parent_aside_id": "learning_aside:parent",
                "title": "Gaussian prior",
                "anchor": {
                    "type": "message",
                    "content": "Why choose a Gaussian prior?",
                },
            },
        )

    assert response.status_code == 200
    assert response.json()["parent_aside_id"] == "learning_aside:parent"
    assert response.json()["chat_session_id"] == "chat_session:nested"
    assert saved["aside"].parent_aside == "learning_aside:parent"
    assert saved["aside"].journey == journey.id
    get_or_create.assert_not_called()
    get_for_session.assert_not_called()


@pytest.mark.asyncio
async def test_create_aside_rejects_discarded_parent(client):
    parent = _aside(
        status="discarded",
        chat_session="chat_session:parent-dive",
    )
    with (
        patch(
            "api.routers.learning._verify_notebook_session",
            new_callable=AsyncMock,
            return_value=(
                "chat_session:parent-dive",
                SimpleNamespace(id="notebook:one"),
                SimpleNamespace(model_override=None),
            ),
        ),
        patch(
            "api.routers.learning._snapshot_parent_context",
            new_callable=AsyncMock,
            return_value=[],
        ),
        patch(
            "api.routers.learning._get_aside",
            new_callable=AsyncMock,
            return_value=parent,
        ),
        patch(
            "api.routers.learning.ChatSession.save",
            new_callable=AsyncMock,
        ) as save_session,
    ):
        response = client.post(
            "/api/learning/asides",
            json={
                "notebook_id": "notebook:one",
                "parent_session_id": "chat_session:parent-dive",
                "parent_aside_id": "learning_aside:aside",
                "anchor": {
                    "type": "message",
                    "content": "Why choose a Gaussian prior?",
                },
            },
        )

    assert response.status_code == 400
    assert response.json()["detail"] == "Discarded asides cannot parent a new dive"
    save_session.assert_not_called()


@pytest.mark.asyncio
async def test_sync_sections_keeps_an_existing_name(client):
    journey = _journey()
    section = LearningSection(
        id="learning_section:one",
        journey=journey.id or "",
        title="Evidence lower bound",
        pinned=True,
        start_message_id="human:one",
        created=NOW,
        updated=NOW,
    )
    with (
        patch(
            "api.routers.learning._verify_notebook_session",
            new_callable=AsyncMock,
            return_value=(
                "chat_session:main",
                SimpleNamespace(id="notebook:one"),
                SimpleNamespace(),
            ),
        ),
        patch(
            "api.routers.learning.LearningJourney.get_or_create",
            new_callable=AsyncMock,
            return_value=journey,
        ),
        patch(
            "api.routers.learning.LearningSection.ensure_for_turns",
            new_callable=AsyncMock,
            return_value=[section],
        ) as ensure,
    ):
        response = client.post(
            "/api/learning/sections/sync",
            json={
                "notebook_id": "notebook:one",
                "main_session_id": "chat_session:main",
                "sections": [
                    {
                        "start_message_id": "human:one",
                        "title": "Explain the ELBO",
                    }
                ],
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body[0]["title"] == "Evidence lower bound"
    assert body[0]["pinned"] is True
    assert body[0]["start_message_id"] == "human:one"
    ensure.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_section_renames_and_pins(client):
    section = LearningSection(
        id="learning_section:one",
        journey="learning_journey:journey",
        title="Evidence lower bound",
        pinned=False,
        start_message_id="human:one",
        created=NOW,
        updated=NOW,
    )

    async def save(saved):
        saved.updated = NOW

    with (
        patch(
            "api.routers.learning.LearningSection.get",
            new_callable=AsyncMock,
            return_value=section,
        ),
        patch("api.routers.learning.LearningSection.save", new=save),
    ):
        response = client.patch(
            "/api/learning/sections/one",
            json={"title": "ELBO derivation", "pinned": True},
        )

    assert response.status_code == 200
    assert response.json()["title"] == "ELBO derivation"
    assert response.json()["pinned"] is True
    assert section.title == "ELBO derivation"
    assert section.pinned is True


def test_sync_sections_rejects_a_blank_title(client):
    response = client.post(
        "/api/learning/sections/sync",
        json={
            "notebook_id": "notebook:one",
            "main_session_id": "chat_session:main",
            "sections": [{"start_message_id": "human:one", "title": "  "}],
        },
    )
    assert response.status_code == 422


def _patch_aside(client, aside, body, journey=None):
    """PATCH /api/learning/asides/{id} with the database mocked out."""
    journey = journey or _journey(active_session=aside.chat_session)
    with (
        patch(
            "api.routers.learning._get_aside",
            new_callable=AsyncMock,
            return_value=aside,
        ),
        patch(
            "api.routers.learning.LearningAside.save", new_callable=AsyncMock
        ) as save_aside,
        patch(
            "api.routers.learning.LearningJourney.get",
            new_callable=AsyncMock,
            return_value=journey,
        ),
        patch(
            "api.routers.learning.LearningJourney.save", new_callable=AsyncMock
        ) as save_journey,
        patch(
            "api.routers.learning._aside_response",
            new_callable=AsyncMock,
            side_effect=lambda aside: _aside_response(aside),
        ),
    ):
        response = client.patch(f"/api/learning/asides/{aside.id}", json=body)
    return response, save_aside, save_journey


@pytest.mark.parametrize(
    ("current", "requested"),
    [
        ("active", "parked"),
        ("parked", "active"),
        ("active", "discarded"),
        ("parked", "discarded"),
        # Asking for the status it already has changes nothing.
        ("active", "active"),
        ("parked", "parked"),
        ("discarded", "discarded"),
    ],
)
def test_patch_aside_allows_learner_status_changes(client, current, requested):
    aside = _aside(status=current)

    response, save_aside, _ = _patch_aside(client, aside, {"status": requested})

    assert response.status_code == 200
    assert response.json()["status"] == requested
    save_aside.assert_awaited_once()


@pytest.mark.parametrize(
    ("current", "requested", "detail"),
    [
        ("resolved", "active", "Resolved asides cannot be reopened"),
        ("resolved", "parked", "Resolved asides cannot be reopened"),
        ("resolved", "discarded", "Resolved asides cannot be reopened"),
        ("discarded", "active", "Discarded asides cannot be reopened"),
        ("discarded", "parked", "Discarded asides cannot be reopened"),
    ],
)
def test_patch_aside_rejects_illegal_status_changes(client, current, requested, detail):
    aside = _aside(status=current)

    response, save_aside, save_journey = _patch_aside(
        client, aside, {"status": requested, "title": "Renamed"}
    )

    assert response.status_code == 400
    assert response.json()["detail"].startswith(detail)
    assert aside.status == current
    assert aside.title != "Renamed"
    save_aside.assert_not_called()
    save_journey.assert_not_called()


@pytest.mark.parametrize("field", ["title", "status"])
def test_patch_aside_rejects_null_fields(client, field):
    aside = _aside()

    response, save_aside, save_journey = _patch_aside(client, aside, {field: None})

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", field]
    save_aside.assert_not_called()
    save_journey.assert_not_called()


@pytest.mark.parametrize(
    ("model", "field", "expected"),
    [
        (
            UpdateLearningAsideRequest,
            "title",
            {"type": "string", "minLength": 1, "maxLength": 200, "title": "Title"},
        ),
        (
            UpdateLearningAsideRequest,
            "status",
            {
                "type": "string",
                "enum": ["active", "parked", "discarded"],
                "title": "Status",
            },
        ),
        (
            UpdateLearningSectionRequest,
            "title",
            {"type": "string", "maxLength": 200, "title": "Title"},
        ),
        (
            UpdateLearningSectionRequest,
            "pinned",
            {"type": "boolean", "title": "Pinned"},
        ),
    ],
)
def test_patch_schemas_do_not_advertise_null(client, model, field, expected):
    """These fields can be left out but reject null, and the API docs say so.

    The whole definition is compared, so dropping null must keep the field's
    type and limits. The model's own schema is checked as well: FastAPI
    leaves a null default out of the docs it serves, but pydantic keeps it.
    """
    schemas = client.get("/openapi.json").json()["components"]["schemas"]
    served = schemas[model.__name__]

    assert served["properties"][field] == expected
    assert model.model_json_schema()["properties"][field] == expected
    assert field not in served.get("required", [])


@pytest.mark.parametrize(
    ("path", "body", "field"),
    [
        ("/api/learning/asides/learning_aside:one", {"status": "bogus"}, "status"),
        ("/api/learning/asides/learning_aside:one", {"title": ""}, "title"),
        ("/api/learning/asides/learning_aside:one", {"title": 5}, "title"),
        ("/api/learning/asides/learning_aside:one", {"title": "x" * 201}, "title"),
        ("/api/learning/sections/learning_section:one", {"pinned": "maybe"}, "pinned"),
        ("/api/learning/sections/learning_section:one", {"title": 5}, "title"),
    ],
)
def test_patch_rejects_a_bad_value_with_one_error_at_the_field(
    client, path, body, field
):
    """A wrong value gets one error that names the field, not one per union arm."""
    response = client.patch(path, json=body)

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert len(detail) == 1, detail
    assert detail[0]["loc"] == ["body", field]


@pytest.mark.parametrize("field", ["title", "pinned"])
def test_patch_section_rejects_null_fields(client, field):
    section = LearningSection(
        id="learning_section:one",
        journey="learning_journey:journey",
        title="Evidence lower bound",
        start_message_id="human:one",
        created=NOW,
        updated=NOW,
    )
    with (
        patch(
            "api.routers.learning.LearningSection.get",
            new_callable=AsyncMock,
            return_value=section,
        ),
        patch(
            "api.routers.learning.LearningSection.save", new_callable=AsyncMock
        ) as save,
    ):
        response = client.patch("/api/learning/sections/one", json={field: None})

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", field]
    save.assert_not_called()


@pytest.mark.parametrize("status", ["resolved", "discarded"])
def test_patch_aside_can_rename_a_closed_aside(client, status):
    aside = _aside(status=status)

    response, save_aside, _ = _patch_aside(client, aside, {"title": "Renamed"})

    assert response.status_code == 200
    assert response.json()["title"] == "Renamed"
    assert response.json()["status"] == status
    save_aside.assert_awaited_once()


@pytest.mark.asyncio
async def test_discarded_aside_rejects_new_messages(client):
    with patch(
        "api.routers.learning._get_aside",
        new_callable=AsyncMock,
        return_value=_aside(status="discarded"),
    ):
        response = client.post(
            "/api/learning/asides/aside/messages",
            json={"message": "Explain this", "context": {}},
        )

    assert response.status_code == 400
    assert response.json()["detail"] == ("Discarded asides cannot receive new messages")


@pytest.mark.asyncio
async def test_resolve_aside_creates_versioned_user_approved_update(client):
    aside = _aside()
    journey = _journey(active_session="chat_session:child")
    saved = []

    async def save_update(update):
        update.id = "learning_update:second"
        update.created = NOW
        update.updated = NOW
        saved.append(update)

    with (
        patch(
            "api.routers.learning._get_aside",
            new_callable=AsyncMock,
            return_value=aside,
        ),
        patch(
            "api.routers.learning.LearningJourney.get",
            new_callable=AsyncMock,
            return_value=journey,
        ),
        patch(
            "api.routers.learning.LearningUpdate.get_versions",
            new_callable=AsyncMock,
            return_value=[
                LearningUpdate(
                    id="learning_update:first",
                    aside=aside.id or "",
                    conclusion="Earlier conclusion",
                )
            ],
        ),
        patch(
            "api.routers.learning.LearningUpdate.save",
            new=save_update,
        ),
        patch("api.routers.learning.LearningAside.save", new_callable=AsyncMock),
        patch("api.routers.learning.LearningJourney.save", new_callable=AsyncMock),
        patch(
            "api.routers.learning._aside_response",
            new_callable=AsyncMock,
            side_effect=lambda aside: _aside_response(aside),
        ),
    ):
        response = client.post(
            "/api/learning/asides/aside/resolve",
            json={
                "conclusion": "Jensen's inequality gives a lower bound.",
                "relevance": "This justifies the first derivation step.",
                "citations": ["source:paper"],
                "include_in_main": True,
            },
        )

    assert response.status_code == 200
    assert response.json()["status"] == "resolved"
    assert aside.status == "resolved"
    assert journey.active_session == "chat_session:main"
    [update] = saved
    assert update.version == 2
    assert update.saved_note is None


def test_resolve_leaves_the_journey_on_another_open_aside(client):
    """Resolving a dive from Studio does not pull the learner out of another."""
    aside = _aside()
    journey = _journey(active_session="chat_session:other-dive")

    async def save_update(update):
        update.id = "learning_update:one"
        update.created = NOW
        update.updated = NOW

    with (
        patch(
            "api.routers.learning._get_aside",
            new_callable=AsyncMock,
            return_value=aside,
        ),
        patch(
            "api.routers.learning.LearningJourney.get",
            new_callable=AsyncMock,
            return_value=journey,
        ),
        patch(
            "api.routers.learning.LearningUpdate.get_versions",
            new_callable=AsyncMock,
            return_value=[],
        ),
        patch("api.routers.learning.LearningUpdate.save", new=save_update),
        patch("api.routers.learning.LearningAside.save", new_callable=AsyncMock),
        patch(
            "api.routers.learning.LearningJourney.save", new_callable=AsyncMock
        ) as save_journey,
        patch(
            "api.routers.learning._aside_response",
            new_callable=AsyncMock,
            side_effect=lambda aside: _aside_response(aside),
        ),
    ):
        response = client.post(
            "/api/learning/asides/aside/resolve",
            json={"conclusion": "Jensen's inequality gives a lower bound."},
        )

    assert response.status_code == 200
    assert response.json()["status"] == "resolved"
    assert journey.active_session == "chat_session:other-dive"
    save_journey.assert_not_called()


@pytest.mark.asyncio
async def test_resume_offers_parked_aside_when_main_session_is_active(client):
    journey = _journey(active_session="chat_session:main")
    aside = _aside(status="parked")
    journey_response = LearningJourneyResponse(
        id=journey.id or "",
        notebook_id=journey.notebook,
        main_session_id=journey.main_session,
        active_session_id=journey.active_session,
        objective=journey.objective,
        status="active",
        asides=[_aside_response(aside)],
        updates=[],
        created=str(NOW),
        updated=str(NOW),
    )
    with (
        patch(
            "api.routers.learning._verify_notebook_session",
            new_callable=AsyncMock,
            return_value=(
                "chat_session:main",
                SimpleNamespace(id="notebook:one"),
                SimpleNamespace(),
            ),
        ),
        patch(
            "api.routers.learning.LearningJourney.get_for_main_session",
            new_callable=AsyncMock,
            return_value=journey,
        ),
        patch(
            "api.routers.learning._journey_response",
            new_callable=AsyncMock,
            return_value=journey_response,
        ),
    ):
        response = client.get(
            "/api/learning/journeys/resume",
            params={
                "notebook_id": "notebook:one",
                "main_session_id": "chat_session:main",
            },
        )

    assert response.status_code == 200
    assert response.json()["recommended_action"] == "resume_aside"
    assert response.json()["current_point"] == aside.title
    assert response.json()["open_aside_ids"] == ["learning_aside:aside"]
    assert response.json()["recommended_aside_id"] == aside.id


@pytest.mark.asyncio
async def test_build_context_includes_only_accepted_learning_updates(client):
    update = LearningUpdate(
        id="learning_update:one",
        aside="learning_aside:aside",
        conclusion="The KL term regularizes the latent space.",
        relevance="It explains the second objective term.",
        citations=["source:paper"],
        include_in_main=True,
    )
    journey = _journey()
    with (
        patch(
            "api.routers.chat.Notebook.get",
            new_callable=AsyncMock,
            return_value=SimpleNamespace(id="notebook:one"),
        ),
        patch(
            "api.routers.chat.build_notebook_context",
            new_callable=AsyncMock,
            return_value=({"sources": [], "notes": []}, "Base context"),
        ),
        patch(
            "api.routers.chat.LearningJourney.get_for_main_session",
            new_callable=AsyncMock,
            return_value=journey,
        ),
        patch(
            "api.routers.chat.LearningJourney.get_updates",
            new_callable=AsyncMock,
            return_value=[update],
        ) as get_updates,
    ):
        response = client.post(
            "/api/chat/context",
            json={
                "notebook_id": "notebook:one",
                "session_id": "chat_session:main",
                "context_config": {"sources": {}, "notes": {}},
            },
        )

    assert response.status_code == 200
    context = response.json()["context"]
    assert context["learning_updates"][0]["conclusion"].startswith("The KL term")
    assert response.json()["char_count"] > len("Base context")
    get_updates.assert_awaited_once_with(include_unmerged=False)


def test_create_aside_rejects_empty_anchor_before_domain_work(client):
    response = client.post(
        "/api/learning/asides",
        json={
            "notebook_id": "notebook:one",
            "parent_session_id": "chat_session:main",
            "anchor": {"type": "message", "content": " "},
        },
    )

    assert response.status_code == 422


def test_go_deeper_on_a_long_answer_stores_a_clipped_anchor(client):
    """Go deeper sends the whole answer; only the stored anchor is clipped."""
    from langchain_core.messages import AIMessage, HumanMessage

    from open_notebook.domain.learning import ANCHOR_CONTENT_MAX_CHARS

    long_answer = "The evidence lower bound follows from Jensen's inequality. " * 600
    long_answer = long_answer.strip()
    assert len(long_answer) > 30_000
    checkpoint = SimpleNamespace(
        values={
            "messages": [
                HumanMessage(content="Explain the ELBO", id="human-1"),
                AIMessage(content=long_answer, id="ai-long"),
            ]
        }
    )
    saved = {}

    async def save_session(session):
        session.id = "chat_session:child"
        session.created = NOW
        session.updated = NOW

    async def save_aside(aside):
        aside.id = "learning_aside:aside"
        aside.created = NOW
        aside.updated = NOW
        saved["aside"] = aside

    with (
        patch(
            "api.routers.learning._verify_notebook_session",
            new_callable=AsyncMock,
            return_value=(
                "chat_session:main",
                SimpleNamespace(id="notebook:one"),
                SimpleNamespace(model_override=None),
            ),
        ),
        patch("api.routers.learning.chat_graph.get_state", return_value=checkpoint),
        patch(
            "api.routers.learning.LearningAside.get_for_chat_session",
            new_callable=AsyncMock,
            return_value=None,
        ),
        patch(
            "api.routers.learning.LearningJourney.get_or_create",
            new_callable=AsyncMock,
            return_value=_journey(),
        ),
        patch("api.routers.learning.ChatSession.save", new=save_session),
        patch(
            "api.routers.learning.ChatSession.relate_to_notebook",
            new_callable=AsyncMock,
        ),
        patch("api.routers.learning.LearningAside.save", new=save_aside),
        patch("api.routers.learning.LearningJourney.save", new_callable=AsyncMock),
        patch(
            "api.routers.learning._aside_response",
            new_callable=AsyncMock,
            side_effect=lambda aside: _aside_response(aside),
        ),
    ):
        response = client.post(
            "/api/learning/asides",
            json={
                "notebook_id": "notebook:one",
                "parent_session_id": "chat_session:main",
                "anchor": {
                    "type": "message",
                    "message_id": "ai-long",
                    "content": long_answer,
                },
            },
        )

    assert response.status_code == 200
    stored = saved["aside"]
    kept = stored.anchor.content
    assert len(kept) <= ANCHOR_CONTENT_MAX_CHARS
    assert kept.endswith("…")
    # A prefix of the answer, cut between two words.
    assert long_answer.startswith(kept[:-1])
    assert long_answer[len(kept) - 1].isspace()
    assert response.json()["anchor"]["content"] == kept
    # The message id and the branch snapshot keep the whole answer.
    assert stored.anchor.message_id == "ai-long"
    assert stored.context_snapshot[-1] == {
        "id": "ai-long",
        "role": "ai",
        "content": long_answer,
    }


def test_create_aside_rejects_an_anchor_over_the_hard_limit(client):
    response = client.post(
        "/api/learning/asides",
        json={
            "notebook_id": "notebook:one",
            "parent_session_id": "chat_session:main",
            "anchor": {"type": "message", "content": "x" * 200_001},
        },
    )

    assert response.status_code == 422
    assert "200000" in str(response.json()["detail"])


_REPLY = {
    "messages": [
        SimpleNamespace(id="human:one", type="human"),
        SimpleNamespace(id="ai:merged-response", type="ai"),
    ]
}


@pytest.mark.asyncio
async def test_main_response_links_learning_update_back_to_message():
    fresh = LearningUpdate(
        id="learning_update:one",
        aside="learning_aside:one",
        conclusion="Accepted conclusion",
    )
    already_linked = LearningUpdate(
        id="learning_update:two",
        aside="learning_aside:two",
        conclusion="Merged earlier",
        applied_message_id="ai:earlier-reply",
    )
    with patch(
        "api.routers.chat.LearningUpdate.mark_applied", new_callable=AsyncMock
    ) as mark_applied:
        await _mark_learning_updates_applied([fresh, already_linked], _REPLY)

    # Only the update without a backlink is linked, to the AI reply.
    mark_applied.assert_awaited_once_with(["learning_update:one"], "ai:merged-response")


@pytest.mark.asyncio
async def test_backlink_is_skipped_when_every_update_is_already_linked():
    linked = LearningUpdate(
        id="learning_update:one",
        aside="learning_aside:one",
        conclusion="Merged earlier",
        applied_message_id="ai:earlier-reply",
    )
    with patch(
        "api.routers.chat.LearningUpdate.mark_applied", new_callable=AsyncMock
    ) as mark_applied:
        await _mark_learning_updates_applied([linked], _REPLY)
        await _mark_learning_updates_applied([], _REPLY)

    mark_applied.assert_not_called()


@pytest.mark.asyncio
async def test_backlink_failure_does_not_fail_the_chat_turn():
    update = LearningUpdate(
        id="learning_update:one",
        aside="learning_aside:one",
        conclusion="Accepted conclusion",
    )
    with patch(
        "api.routers.chat.LearningUpdate.mark_applied",
        new_callable=AsyncMock,
        side_effect=RuntimeError("database unavailable"),
    ):
        await _mark_learning_updates_applied([update], _REPLY)


@pytest.mark.asyncio
async def test_mark_applied_only_writes_missing_backlinks():
    with patch(
        "open_notebook.domain.learning.repo_query",
        new_callable=AsyncMock,
        return_value=[],
    ) as repo_query:
        await LearningUpdate.mark_applied(
            ["learning_update:one", "learning_update:two"], "ai:reply"
        )

    assert repo_query.await_args is not None
    query, params = repo_query.await_args.args
    assert "SET applied_message_id = $message_id" in query
    assert "WHERE applied_message_id = NONE" in query
    assert [str(record_id) for record_id in params["update_ids"]] == [
        "learning_update:one",
        "learning_update:two",
    ]
    assert params["message_id"] == "ai:reply"


@pytest.mark.asyncio
async def test_mark_applied_without_updates_queries_nothing():
    with patch(
        "open_notebook.domain.learning.repo_query", new_callable=AsyncMock
    ) as repo_query:
        await LearningUpdate.mark_applied([], "ai:reply")

    repo_query.assert_not_called()


def test_model_facing_context_hides_learning_update_ids():
    from api.routers._chat_shared import model_facing_context

    raw: dict[str, Any] = {
        "sources": [{"id": "source:paper"}],
        "learning_updates": [
            {
                "id": "learning_update:4blhghrdah77x4j3ap02",
                "conclusion": "Jensen gives a lower bound.",
                "relevance": "First derivation step.",
                "open_questions": [],
                "citations": ["source:paper"],
                "applied_message_id": "ai:earlier",
            }
        ],
    }

    prepared = model_facing_context(raw)

    assert prepared["learning_updates"] == [
        {
            "conclusion": "Jensen gives a lower bound.",
            "relevance": "First derivation step.",
            "citations": ["source:paper"],
        }
    ]
    assert "learning_update:" not in str(prepared["learning_updates"])
    assert "Never expose or cite" in prepared["learning_updates_instruction"]
    assert prepared["sources"] == raw["sources"]
    # The caller's context is not mutated.
    assert raw["learning_updates"][0]["id"] == "learning_update:4blhghrdah77x4j3ap02"


def test_model_facing_context_without_updates_adds_no_instruction():
    from api.routers._chat_shared import model_facing_context

    assert model_facing_context({"sources": []}) == {"sources": []}


def test_main_chat_prompt_forbids_citing_learning_ids():
    from ai_prompter import Prompter

    rendered = Prompter(prompt_template="chat/system").render(
        data={"messages": [], "context": {"learning_updates": []}}
    )
    assert "learning_update:" in rendered
    assert "Never cite or mention internal record IDs" in rendered


def _execute_main_chat(client, request_context, learning=None, notebook_rows=()):
    """POST /api/chat/execute with the database and model mocked out.

    ``learning`` is what the learning-context loader returns; with None the
    real loader runs (patch the journey lookups instead). Returns the response,
    the context the model received, the loader mock and the backlink mock.
    """
    from api.routers._chat_shared import load_main_learning_context

    loader = (
        AsyncMock(wraps=load_main_learning_context)
        if learning is None
        else AsyncMock(return_value=learning)
    )
    captured: dict[str, Any] = {}

    def fake_invoke(graph, state, config, user_message):
        captured["context"] = state["context"]
        return {
            "messages": [
                user_message,
                SimpleNamespace(id="ai:reply", type="ai", content="Answer"),
            ]
        }

    session = SimpleNamespace(model_override=None, save=AsyncMock())
    with (
        patch(
            "api.routers.chat.get_session_or_404",
            new_callable=AsyncMock,
            return_value=("chat_session:main", session),
        ),
        patch(
            "api.routers.chat.repo_query",
            new_callable=AsyncMock,
            return_value=list(notebook_rows),
        ),
        patch(
            "api.routers.chat.Notebook.get",
            new_callable=AsyncMock,
            return_value=SimpleNamespace(id="notebook:one"),
        ),
        patch(
            "api.routers.chat.chat_graph.get_state",
            return_value=SimpleNamespace(values={"messages": []}),
        ),
        patch("api.routers.chat.invoke_chat_turn", new=fake_invoke),
        patch(
            "api.routers.chat.load_main_learning_context", new=loader
        ) as load_learning,
        patch(
            "api.routers.chat._mark_learning_updates_applied",
            new_callable=AsyncMock,
        ) as mark_applied,
        patch(
            "api.routers.chat.extract_chat_messages",
            return_value=[],
        ),
    ):
        response = client.post(
            "/api/chat/execute",
            json={
                "session_id": "chat_session:main",
                "message": "Continue",
                "context": request_context,
            },
        )
    return response, captured.get("context"), load_learning, mark_applied


def test_execute_chat_sends_server_loaded_updates_to_model_without_ids(client):
    from api.routers._chat_shared import MainLearningContext

    accepted = LearningUpdate(
        id="learning_update:accepted",
        aside="learning_aside:one",
        conclusion="Accepted conclusion",
        citations=["source:paper"],
    )
    learning = MainLearningContext(updates=(accepted,))
    # A stale or edited copy echoed back by the client.
    request_context = {
        "sources": [{"id": "source:paper"}],
        "learning_updates": [
            {"id": "learning_update:forged", "conclusion": "Not accepted"}
        ],
        "learning_updates_instruction": "Cite learning_update IDs freely.",
    }

    response, model_context, load_learning, mark_applied = _execute_main_chat(
        client,
        request_context,
        learning,
        notebook_rows=[{"out": "notebook:one"}],
    )

    assert response.status_code == 200
    assert model_context["learning_updates"] == [
        {"conclusion": "Accepted conclusion", "citations": ["source:paper"]}
    ]
    assert "learning_update:" not in str(model_context["learning_updates"])
    assert "Never expose or cite" in model_context["learning_updates_instruction"]
    assert model_context["sources"] == [{"id": "source:paper"}]
    load_learning.assert_awaited_once_with(
        "chat_session:main", notebook_id="notebook:one"
    )
    # The backlink uses the updates the server loaded, not request IDs.
    assert mark_applied.await_args is not None
    assert mark_applied.await_args.args[0] == (accepted,)


def test_execute_chat_ignores_client_updates_when_none_are_accepted(client):
    from api.routers._chat_shared import MainLearningContext

    request_context = {
        "learning_updates": [
            {"id": "learning_update:old", "conclusion": "Excluded since"}
        ]
    }

    response, model_context, load_learning, mark_applied = _execute_main_chat(
        client, request_context, MainLearningContext()
    )

    assert response.status_code == 200
    assert "learning_updates" not in model_context
    assert "learning_updates_instruction" not in model_context
    # A session without a notebook link still gets a journey lookup.
    load_learning.assert_awaited_once_with("chat_session:main", notebook_id=None)
    assert mark_applied.await_args is not None
    assert mark_applied.await_args.args[0] == ()


def test_main_chat_model_context_replaces_client_learning_updates():
    from api.routers._chat_shared import MainLearningContext, main_chat_model_context

    accepted = LearningUpdate(
        id="learning_update:accepted",
        aside="learning_aside:one",
        conclusion="Accepted conclusion",
        relevance="Explains the second term.",
    )
    client_context: dict[str, Any] = {
        "notes": [],
        "learning_updates": [{"id": "learning_update:x", "conclusion": "Stale"}],
    }

    with patch("api.routers._chat_shared.logger") as log:
        prepared = main_chat_model_context(
            client_context, MainLearningContext(updates=(accepted,))
        )

    assert prepared["learning_updates"] == [
        {
            "conclusion": "Accepted conclusion",
            "relevance": "Explains the second term.",
        }
    ]
    assert prepared["notes"] == []
    log.debug.assert_called_once()
    # The caller's dict is not touched.
    assert client_context["learning_updates"][0]["conclusion"] == "Stale"


def test_main_chat_model_context_without_client_updates_logs_nothing():
    from api.routers._chat_shared import MainLearningContext, main_chat_model_context

    with patch("api.routers._chat_shared.logger") as log:
        prepared = main_chat_model_context({"sources": []}, MainLearningContext())

    assert prepared == {"sources": []}
    log.debug.assert_not_called()


@pytest.mark.asyncio
async def test_learning_context_loads_latest_included_updates_for_the_journey():
    from api.routers._chat_shared import load_main_learning_context

    update = LearningUpdate(
        id="learning_update:one",
        aside="learning_aside:aside",
        conclusion="Accepted conclusion",
    )
    with (
        patch(
            "api.routers._chat_shared.LearningJourney.get_for_main_session",
            new_callable=AsyncMock,
            return_value=_journey(),
        ) as get_journey,
        patch(
            "api.routers._chat_shared.LearningJourney.get_updates",
            new_callable=AsyncMock,
            return_value=[update],
        ) as get_updates,
    ):
        learning = await load_main_learning_context(
            "chat_session:main", notebook_id="notebook:one"
        )

    assert learning.updates == (update,)
    assert learning.context_entries()[0]["id"] == "learning_update:one"
    get_journey.assert_awaited_once_with("chat_session:main")
    get_updates.assert_awaited_once_with(include_unmerged=False)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("journey", "notebook_id"),
    [
        (None, "notebook:one"),
        (_journey(notebook="notebook:other"), "notebook:one"),
    ],
    ids=["no-journey", "journey-of-another-notebook"],
)
async def test_learning_context_is_empty_without_a_matching_journey(
    journey, notebook_id
):
    from api.routers._chat_shared import load_main_learning_context

    with (
        patch(
            "api.routers._chat_shared.LearningJourney.get_for_main_session",
            new_callable=AsyncMock,
            return_value=journey,
        ),
        patch(
            "api.routers._chat_shared.LearningJourney.get_updates",
            new_callable=AsyncMock,
        ) as get_updates,
    ):
        learning = await load_main_learning_context(
            "chat_session:main", notebook_id=notebook_id
        )

    assert learning.updates == ()
    get_updates.assert_not_called()


@pytest.mark.asyncio
async def test_aside_response_marks_older_resolutions_superseded():
    from api.routers.learning import _aside_response as real_aside_response

    aside = _aside(status="resolved")
    updates = [
        LearningUpdate(
            id="learning_update:first",
            aside=aside.id or "",
            conclusion="Earlier conclusion",
            version=1,
            applied_message_id="ai:old-reply",
        ),
        LearningUpdate(
            id="learning_update:second",
            aside=aside.id or "",
            conclusion="Revised conclusion",
            version=2,
        ),
    ]
    with (
        patch(
            "api.routers.learning._raw_session_messages",
            new_callable=AsyncMock,
            return_value=[],
        ),
        patch(
            "api.routers.learning.LearningAside.get_updates",
            new_callable=AsyncMock,
            return_value=updates,
        ),
    ):
        response = await real_aside_response(aside)

    assert [update.superseded for update in response.updates] == [True, False]
    # The superseded version keeps its historical backlink.
    assert response.updates[0].applied_message_id == "ai:old-reply"
    assert response.updates[1].applied_message_id is None


@pytest.mark.asyncio
async def test_resume_lists_only_current_resolutions_as_accepted(client):
    from api.routers.learning import _update_responses

    journey = _journey()
    aside = _aside(status="resolved")
    updates = _update_responses(
        [
            LearningUpdate(
                id="learning_update:first",
                aside=aside.id or "",
                conclusion="Earlier conclusion",
                version=1,
                created=NOW,
                updated=NOW,
            ),
            LearningUpdate(
                id="learning_update:second",
                aside=aside.id or "",
                conclusion="Revised conclusion",
                version=2,
                created=NOW,
                updated=NOW,
            ),
        ]
    )
    journey_response = LearningJourneyResponse(
        id=journey.id or "",
        notebook_id=journey.notebook,
        main_session_id=journey.main_session,
        active_session_id=journey.active_session,
        objective=journey.objective,
        status="active",
        asides=[_aside_response(aside)],
        updates=updates,
        created=str(NOW),
        updated=str(NOW),
    )
    with (
        patch(
            "api.routers.learning._verify_notebook_session",
            new_callable=AsyncMock,
            return_value=("chat_session:main", SimpleNamespace(), SimpleNamespace()),
        ),
        patch(
            "api.routers.learning.LearningJourney.get_for_main_session",
            new_callable=AsyncMock,
            return_value=journey,
        ),
        patch(
            "api.routers.learning._journey_response",
            new_callable=AsyncMock,
            return_value=journey_response,
        ),
    ):
        response = client.get(
            "/api/learning/journeys/resume",
            params={"notebook_id": "notebook:one", "main_session_id": "main"},
        )

    assert response.status_code == 200
    assert response.json()["accepted_findings"] == ["Revised conclusion"]


def test_resume_leaves_out_conclusions_of_discarded_asides(client):
    from api.routers.learning import _update_responses

    journey = _journey()
    kept = _aside(id="learning_aside:kept", status="resolved")
    dropped = _aside(
        id="learning_aside:dropped",
        chat_session="chat_session:dropped",
        status="discarded",
    )
    updates = _update_responses(
        [
            LearningUpdate(
                id=f"learning_update:{aside.id.split(':')[1]}",
                aside=aside.id or "",
                conclusion=f"{aside.id} conclusion",
                created=NOW,
                updated=NOW,
            )
            for aside in (kept, dropped)
            if aside.id
        ]
    )
    journey_response = LearningJourneyResponse(
        id=journey.id or "",
        notebook_id=journey.notebook,
        main_session_id=journey.main_session,
        active_session_id=journey.active_session,
        objective=journey.objective,
        status="active",
        asides=[_aside_response(kept), _aside_response(dropped)],
        updates=updates,
        created=str(NOW),
        updated=str(NOW),
    )
    with (
        patch(
            "api.routers.learning._verify_notebook_session",
            new_callable=AsyncMock,
            return_value=("chat_session:main", SimpleNamespace(), SimpleNamespace()),
        ),
        patch(
            "api.routers.learning.LearningJourney.get_for_main_session",
            new_callable=AsyncMock,
            return_value=journey,
        ),
        patch(
            "api.routers.learning._journey_response",
            new_callable=AsyncMock,
            return_value=journey_response,
        ),
    ):
        response = client.get(
            "/api/learning/journeys/resume",
            params={"notebook_id": "notebook:one", "main_session_id": "main"},
        )

    assert response.status_code == 200
    assert response.json()["accepted_findings"] == ["learning_aside:kept conclusion"]


# Pass as ``learning`` to run the real conclusions loader in an aside turn.
REAL_LOADER = object()


def _send_aside_message(
    client, aside, journey, captured=None, context=None, learning=None
):
    """POST an aside message with the database and model mocked out.

    ``learning`` is what the accepted-conclusions loader returns (none by
    default); with REAL_LOADER the real loader runs, so patch the journey
    lookups instead.
    """
    from api.routers._chat_shared import (
        MainLearningContext,
        load_main_learning_context,
    )

    loader = (
        AsyncMock(wraps=load_main_learning_context)
        if learning is REAL_LOADER
        else AsyncMock(return_value=learning or MainLearningContext())
    )

    def fake_invoke(graph, state, config, user_message):
        if captured is not None:
            captured["context"] = state["context"]
            captured["state"] = dict(state)
        return {"messages": [user_message, SimpleNamespace(id="ai:r", type="ai")]}

    with (
        patch(
            "api.routers.learning._get_aside",
            new_callable=AsyncMock,
            return_value=aside,
        ),
        patch(
            "api.routers.learning.LearningJourney.get",
            new_callable=AsyncMock,
            return_value=journey,
        ),
        patch(
            "api.routers.learning.ChatSession.get",
            new_callable=AsyncMock,
            return_value=SimpleNamespace(model_override=None, save=AsyncMock()),
        ),
        patch(
            "api.routers.learning.Notebook.get",
            new_callable=AsyncMock,
            return_value=SimpleNamespace(id="notebook:one"),
        ),
        patch(
            "api.routers.learning.chat_graph.get_state",
            return_value=SimpleNamespace(values={"messages": []}),
        ),
        patch("api.routers.learning.invoke_chat_turn", new=fake_invoke),
        patch("api.routers.learning.load_main_learning_context", new=loader),
        patch(
            "api.routers.learning.LearningAside.save", new_callable=AsyncMock
        ) as save_aside,
        patch(
            "api.routers.learning.LearningJourney.save", new_callable=AsyncMock
        ) as save_journey,
        patch(
            "api.routers.learning._aside_response",
            new_callable=AsyncMock,
            side_effect=lambda aside: _aside_response(aside),
        ),
    ):
        response = client.post(
            f"/api/learning/asides/{aside.id.split(':')[1]}/messages",
            json={"message": "One more question", "context": context or {}},
        )
    return response, save_aside, save_journey


def test_follow_up_on_resolved_aside_keeps_it_resolved(client):
    aside = _aside(status="resolved")
    journey = _journey(active_session="chat_session:main")

    response, save_aside, save_journey = _send_aside_message(client, aside, journey)

    assert response.status_code == 200
    assert response.json()["status"] == "resolved"
    assert aside.status == "resolved"
    assert journey.active_session == "chat_session:main"
    save_aside.assert_not_called()
    save_journey.assert_not_called()


def test_message_to_parked_aside_resumes_it(client):
    aside = _aside(status="parked")
    journey = _journey(active_session="chat_session:main")

    response, save_aside, save_journey = _send_aside_message(client, aside, journey)

    assert response.status_code == 200
    assert aside.status == "active"
    assert journey.active_session == "chat_session:child"
    save_aside.assert_awaited_once()
    save_journey.assert_awaited_once()


def _nested_chain():
    root = _aside(
        id="learning_aside:root",
        chat_session="chat_session:root",
        parent_session="chat_session:main",
        title="What is the ELBO?",
        status="resolved",
        anchor=AsideAnchor(content="The ELBO bounds the log evidence."),
        context_snapshot=[
            {"id": "h1", "role": "human", "content": "Explain VAEs"},
            {"id": "a1", "role": "ai", "content": "MAIN THREAD ANSWER"},
        ],
    )
    middle = _aside(
        id="learning_aside:middle",
        parent_aside="learning_aside:root",
        chat_session="chat_session:middle",
        parent_session="chat_session:root",
        title="Why Jensen?",
        status="active",
        anchor=AsideAnchor(content="Jensen's inequality gives the bound."),
        context_snapshot=[
            {"id": "r1", "role": "ai", "content": "ROOT ASIDE TRANSCRIPT " * 50}
        ],
    )
    leaf = _aside(
        id="learning_aside:leaf",
        parent_aside="learning_aside:middle",
        chat_session="chat_session:leaf",
        parent_session="chat_session:middle",
        title="What is convexity?",
        anchor=AsideAnchor(content="log is concave."),
        context_snapshot=[{"id": "m1", "role": "ai", "content": "MIDDLE TRANSCRIPT"}],
    )
    return root, middle, leaf


@pytest.mark.asyncio
async def test_nested_dive_learning_path_summarizes_every_ancestor():
    from api.routers.learning import _learning_path

    root, middle, leaf = _nested_chain()
    by_id = {aside.id: aside for aside in (root, middle)}
    updates = {
        root.id: [
            LearningUpdate(aside=root.id or "", conclusion="Old ELBO", version=1),
            LearningUpdate(
                aside=root.id or "", conclusion="ELBO is a bound", version=2
            ),
        ],
        middle.id: [],
    }

    async def fake_get(record_id):
        return by_id[record_id]

    async def fake_updates(self):
        return updates[self.id]

    with (
        patch(
            "api.routers.learning.LearningAside.get",
            new_callable=AsyncMock,
            side_effect=fake_get,
        ),
        patch.object(LearningAside, "get_updates", new=fake_updates),
        patch(
            "api.routers.learning._raw_session_messages",
            new_callable=AsyncMock,
        ) as raw_messages,
    ):
        path = await _learning_path(leaf)

    assert path is not None
    assert "MAIN THREAD ANSWER" in path
    assert path.index("What is the ELBO?") < path.index("Why Jensen?")
    assert "ELBO is a bound" in path
    assert "Old ELBO" not in path
    assert "Jensen's inequality gives the bound." in path
    assert "no conclusion yet" in path
    # Ancestor transcripts are not dumped; the immediate parent's transcript
    # travels separately as parent_conversation_at_branch.
    assert "ROOT ASIDE TRANSCRIPT" not in path
    assert "learning_aside:" not in path
    raw_messages.assert_not_called()


@pytest.mark.asyncio
async def test_top_level_aside_has_no_learning_path():
    from api.routers.learning import _learning_path

    assert await _learning_path(_aside()) is None


@pytest.mark.asyncio
async def test_learning_path_is_bounded_for_deep_and_long_ancestry():
    from api.routers.learning import (
        LEARNING_PATH_CHARS,
        MAX_ANCESTOR_DEPTH,
        _learning_path,
    )

    long_text = "x" * 20_000
    chain = {
        f"learning_aside:a{depth}": _aside(
            id=f"learning_aside:a{depth}",
            parent_aside=f"learning_aside:a{depth + 1}" if depth < 30 else None,
            chat_session=f"chat_session:a{depth}",
            title=f"Level {depth}",
            anchor=AsideAnchor(content=long_text),
            context_snapshot=[{"role": "ai", "content": long_text}],
        )
        for depth in range(31)
    }
    leaf = _aside(parent_aside="learning_aside:a0")
    get = AsyncMock(side_effect=lambda record_id: chain[record_id])

    async def no_updates(self):
        return []

    with (
        patch("api.routers.learning.LearningAside.get", new=get),
        patch.object(LearningAside, "get_updates", new=no_updates),
    ):
        path = await _learning_path(leaf)

    assert path is not None
    assert len(path) <= LEARNING_PATH_CHARS
    assert get.await_count == MAX_ANCESTOR_DEPTH
    # The innermost ancestor survives the bound.
    assert "Level 0" in path


@pytest.mark.asyncio
async def test_learning_path_stops_on_a_parent_cycle():
    from api.routers.learning import _learning_path

    first = _aside(id="learning_aside:first", parent_aside="learning_aside:second")
    second = _aside(id="learning_aside:second", parent_aside="learning_aside:first")
    get = AsyncMock(return_value=second)

    async def no_updates(self):
        return []

    with (
        patch("api.routers.learning.LearningAside.get", new=get),
        patch.object(LearningAside, "get_updates", new=no_updates),
    ):
        path = await _learning_path(first)

    assert path is not None
    assert get.await_count == 1


def test_nested_dive_message_carries_learning_path(client):
    _, _, leaf = _nested_chain()
    journey = _journey()
    captured: dict[str, Any] = {}
    with patch(
        "api.routers.learning._learning_path",
        new_callable=AsyncMock,
        return_value="LEARNING PATH",
    ):
        response, _, _ = _send_aside_message(client, leaf, journey, captured)

    assert response.status_code == 200
    aside_context = captured["context"]["learning_aside"]
    assert aside_context["learning_path"] == "LEARNING PATH"
    assert "MIDDLE TRANSCRIPT" in aside_context["parent_conversation_at_branch"]
    assert "nested dive" in aside_context["instruction"]


def test_aside_turn_gives_the_model_no_internal_ids(client):
    """What the aside model reads names no message, aside, update or session."""
    from ai_prompter import Prompter

    anchor_message = "lc_run--0f8c3a52-1b7e-4d2a-9c1e-5b9a7d3e2f10"
    parent = _aside(
        id="learning_aside:parentdive",
        chat_session="chat_session:parentdivesession",
        title="Why Jensen?",
        status="resolved",
        anchor=AsideAnchor(
            type="message",
            message_id="lc_run--rootanswer",
            content="Jensen's inequality gives the bound.",
        ),
        context_snapshot=[
            {"id": "lc_run--rootanswer", "role": "ai", "content": "MAIN THREAD"}
        ],
    )
    leaf = _aside(
        id="learning_aside:leafdive",
        parent_aside=parent.id,
        parent_session=parent.chat_session,
        chat_session="chat_session:leafdivesession",
        anchor=AsideAnchor(
            type="message",
            message_id=anchor_message,
            content="log is concave.",
            locator="selection",
        ),
        context_snapshot=[
            {"id": anchor_message, "role": "ai", "content": "PARENT DIVE ANSWER"}
        ],
    )
    parent_conclusion = LearningUpdate(
        id="learning_update:parentconclusion",
        aside=parent.id or "",
        conclusion="The bound follows from concavity.",
        applied_message_id="lc_run--mergedreply",
    )

    async def parent_updates(self):
        return [parent_conclusion]

    from api.routers._chat_shared import MainLearningContext

    accepted = LearningUpdate(
        id="learning_update:mainconclusion",
        aside="learning_aside:siblingdive",
        conclusion="An accepted conclusion from the journey.",
        applied_message_id="lc_run--mainreply",
    )
    captured: dict[str, Any] = {}
    with (
        patch(
            "api.routers.learning.LearningAside.get",
            new_callable=AsyncMock,
            return_value=parent,
        ),
        patch.object(LearningAside, "get_updates", new=parent_updates),
    ):
        response, _, _ = _send_aside_message(
            client,
            leaf,
            _journey(),
            captured,
            learning=MainLearningContext(updates=(accepted,)),
        )

    assert response.status_code == 200
    state = captured["state"]
    aside_context = state["context"]["learning_aside"]
    # The path and the branch transcript did reach the model.
    assert "The bound follows from concavity." in aside_context["learning_path"]
    assert "PARENT DIVE ANSWER" in aside_context["parent_conversation_at_branch"]
    assert aside_context["anchor"] == {"type": "message", "content": "log is concave."}
    assert state["context"]["learning_updates"] == [
        {"conclusion": "An accepted conclusion from the journey."}
    ]
    model_text = str(state["context"]) + Prompter(prompt_template="chat/system").render(
        data=state
    )
    for internal_id in (
        anchor_message,
        "lc_run--rootanswer",
        "lc_run--mergedreply",
        state["messages"][-1].id,
        leaf.id,
        leaf.journey,
        leaf.chat_session,
        parent.id,
        parent.chat_session,
        parent.parent_session,
        parent_conclusion.id,
        accepted.id,
        accepted.aside,
        "lc_run--mainreply",
    ):
        assert internal_id
        assert internal_id not in model_text


@pytest.mark.parametrize(
    ("source_id", "visible"),
    [
        ("source:paper", True),
        ("note:summary", True),
        ("source_insight:finding", True),
        ("chat_session:main", False),
        ("learning_aside:other", False),
        ("lc_run--message", False),
    ],
)
def test_aside_anchor_shows_the_model_only_a_citable_source(client, source_id, visible):
    aside = _aside(
        anchor=AsideAnchor(
            type="citation", content="The cited claim.", source_id=source_id
        )
    )
    captured: dict[str, Any] = {}

    response, _, _ = _send_aside_message(client, aside, _journey(), captured)

    assert response.status_code == 200
    expected = {"type": "citation", "content": "The cited claim."}
    if visible:
        expected["source_id"] = source_id
    assert captured["context"]["learning_aside"]["anchor"] == expected


def _get_journey_with_asides(client, params):
    journey = _journey()
    asides = [
        _aside(id="learning_aside:one", chat_session="chat_session:one"),
        _aside(id="learning_aside:two", chat_session="chat_session:two"),
    ]
    updates = [
        LearningUpdate(
            id="learning_update:two",
            aside="learning_aside:two",
            conclusion="Two",
            created=NOW,
            updated=NOW,
        )
    ]
    with (
        patch(
            "api.routers.learning._verify_notebook_session",
            new_callable=AsyncMock,
            return_value=("chat_session:main", SimpleNamespace(), SimpleNamespace()),
        ),
        patch(
            "api.routers.learning.LearningJourney.get_for_main_session",
            new_callable=AsyncMock,
            return_value=journey,
        ),
        patch(
            "api.routers.learning.LearningJourney.get_asides",
            new_callable=AsyncMock,
            return_value=asides,
        ),
        patch(
            "api.routers.learning.LearningJourney.get_updates",
            new_callable=AsyncMock,
            return_value=updates,
        ),
        patch(
            "api.routers.learning.LearningAside.get_updates",
            new_callable=AsyncMock,
        ) as per_aside_updates,
        patch(
            "api.routers.learning.LearningSection.get_for_journey",
            new_callable=AsyncMock,
            return_value=[],
        ),
        patch(
            "api.routers.learning._raw_session_messages",
            new_callable=AsyncMock,
            return_value=[SimpleNamespace(id="ai:1", type="ai", content="Hello")],
        ) as raw_messages,
    ):
        response = client.get(
            "/api/learning/journeys",
            params={"notebook_id": "notebook:one", "main_session_id": "main", **params},
        )
    return response, raw_messages, per_aside_updates


def test_journey_listing_does_not_load_aside_transcripts(client):
    response, raw_messages, per_aside_updates = _get_journey_with_asides(client, {})

    assert response.status_code == 200
    body = response.json()
    assert [aside["messages"] for aside in body["asides"]] == [[], []]
    assert [len(aside["updates"]) for aside in body["asides"]] == [0, 1]
    raw_messages.assert_not_called()
    # Updates are loaded once for the journey, not once per aside.
    per_aside_updates.assert_not_called()


def test_journey_listing_can_still_include_transcripts(client):
    response, raw_messages, _ = _get_journey_with_asides(
        client, {"include_messages": "true"}
    )

    assert response.status_code == 200
    assert response.json()["asides"][0]["messages"][0]["content"] == "Hello"
    assert raw_messages.await_count == 2


# --- Token budget for accepted conclusions -----------------------------------


def _priced_update(name: str, cost: int, minute: int | None = None, **fields):
    """An accepted update whose prompt text costs ``cost`` fake tokens."""
    return LearningUpdate(
        id=f"learning_update:{name}",
        aside=f"learning_aside:{name}",
        conclusion=f"{name} cost={cost}",
        created=None if minute is None else datetime(2026, 10, 28, 12, minute),
        **fields,
    )


def _fake_token_count(text: str) -> int:
    """Charge each update the cost written into its conclusion."""
    import re

    return sum(int(cost) for cost in re.findall(r"cost=(\d+)", text))


def _fit(updates, budget):
    from api.routers._chat_shared import fit_learning_updates_to_budget

    with patch("api.routers._chat_shared.token_count", new=_fake_token_count):
        kept, omitted = fit_learning_updates_to_budget(updates, budget)
    return [update.id for update in kept], omitted


def test_budget_keeps_every_update_that_fits():
    updates = [_priced_update("a", 100, 1), _priced_update("b", 100, 2)]

    assert _fit(updates, 200) == (["learning_update:a", "learning_update:b"], 0)


def test_budget_keeps_the_newest_updates_in_chronological_order():
    updates = [
        _priced_update("oldest", 100, 1),
        _priced_update("middle", 100, 2),
        _priced_update("newest", 100, 3),
    ]

    assert _fit(updates, 250) == (
        ["learning_update:middle", "learning_update:newest"],
        1,
    )


def test_budget_ranks_by_creation_time_not_list_position():
    updates = [
        _priced_update("newest", 100, 3),
        _priced_update("oldest", 100, 1),
        _priced_update("middle", 100, 2),
    ]

    # The oldest is left out; the kept ones keep their list order.
    assert _fit(updates, 200) == (
        ["learning_update:newest", "learning_update:middle"],
        1,
    )


def test_budget_skips_an_update_that_does_not_fit_and_keeps_filling():
    updates = [
        _priced_update("old-short", 10, 1),
        _priced_update("long", 150, 2),
        _priced_update("newest", 100, 3),
    ]

    # "long" does not fit after "newest"; the older, shorter one still does.
    assert _fit(updates, 200) == (
        ["learning_update:old-short", "learning_update:newest"],
        1,
    )


def test_budget_skips_a_newest_update_too_large_for_the_whole_budget():
    updates = [_priced_update("small", 10, 1), _priced_update("huge", 500, 2)]

    assert _fit(updates, 200) == (["learning_update:small"], 1)


def test_budget_keeps_filling_past_several_updates_that_do_not_fit():
    updates = [
        _priced_update("a", 100, 1),
        _priced_update("long-1", 250, 2),
        _priced_update("b", 50, 3),
        _priced_update("long-2", 500, 4),
        _priced_update("c", 100, 5),
    ]

    # c (100), b (150) and a (250) fit; both long ones are skipped.
    assert _fit(updates, 300) == (
        ["learning_update:a", "learning_update:b", "learning_update:c"],
        2,
    )


def test_budget_never_trades_a_newer_update_for_an_older_one():
    updates = [
        _priced_update("old-1", 60, 1),
        _priced_update("old-2", 60, 2),
        _priced_update("new", 150, 3),
    ]

    # The newest fits first; only the room it leaves goes to older ones.
    assert _fit(updates, 200) == (["learning_update:new"], 2)


def test_budget_treats_later_list_positions_as_newer_without_timestamps():
    updates = [_priced_update("first", 100), _priced_update("second", 100)]

    assert _fit(updates, 150) == (["learning_update:second"], 1)


def test_budget_measures_the_model_visible_update():
    from api.routers._chat_shared import fit_learning_updates_to_budget

    update = LearningUpdate(
        id="learning_update:one",
        aside="learning_aside:one",
        conclusion="Jensen gives a lower bound.",
        relevance="First derivation step.",
        open_questions=["Why a Gaussian prior?"],
        citations=["source:paper"],
        applied_message_id="ai:earlier",
    )
    measured: list[str] = []

    def count(text: str) -> int:
        measured.append(text)
        return 1

    with patch("api.routers._chat_shared.token_count", new=count):
        fit_learning_updates_to_budget([update], 10)

    [text] = measured
    for visible in (
        "Jensen gives a lower bound.",
        "First derivation step.",
        "Why a Gaussian prior?",
        "source:paper",
    ):
        assert visible in text
    assert "learning_update:" not in text
    assert "ai:earlier" not in text


@contextmanager
def _journey_with_updates(updates, budget):
    """A main-session journey with these accepted updates and token budget."""
    with (
        patch(
            "api.routers._chat_shared.LearningJourney.get_for_main_session",
            new_callable=AsyncMock,
            return_value=_journey(),
        ),
        patch(
            "api.routers._chat_shared.LearningJourney.get_updates",
            new_callable=AsyncMock,
            return_value=updates,
        ),
        patch("api.routers._chat_shared.LEARNING_UPDATES_TOKEN_BUDGET", budget),
        patch("api.routers._chat_shared.token_count", new=_fake_token_count),
    ):
        yield


@pytest.mark.asyncio
async def test_learning_context_applies_the_budget():
    from api.routers._chat_shared import load_main_learning_context

    updates = [_priced_update("old", 300, 1), _priced_update("new", 300, 2)]
    with _journey_with_updates(updates, 400):
        learning = await load_main_learning_context(
            "chat_session:main", notebook_id="notebook:one"
        )

    assert [update.id for update in learning.updates] == ["learning_update:new"]
    assert learning.omitted == 1


def test_build_context_reports_updates_left_out_by_the_budget(client):
    updates = [
        _priced_update("oldest", 300, 1),
        _priced_update("middle", 300, 2),
        _priced_update("newest", 300, 3),
    ]
    with (
        patch(
            "api.routers.chat.Notebook.get",
            new_callable=AsyncMock,
            return_value=SimpleNamespace(id="notebook:one"),
        ),
        patch(
            "api.routers.chat.build_notebook_context",
            new_callable=AsyncMock,
            return_value=({"sources": [], "notes": []}, ""),
        ),
        _journey_with_updates(updates, 700),
    ):
        response = client.post(
            "/api/chat/context",
            json={
                "notebook_id": "notebook:one",
                "session_id": "main",
                "context_config": {"sources": {}, "notes": {}},
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert [entry["id"] for entry in body["context"]["learning_updates"]] == [
        "learning_update:middle",
        "learning_update:newest",
    ]
    assert body["learning_updates_omitted"] == 1
    # Only what is sent is counted.
    assert "oldest" not in str(body["context"])
    assert body["char_count"] == len(
        "{'conclusion': 'middle cost=300'}{'conclusion': 'newest cost=300'}"
    )


def test_build_context_without_a_session_omits_nothing(client):
    with (
        patch(
            "api.routers.chat.Notebook.get",
            new_callable=AsyncMock,
            return_value=SimpleNamespace(id="notebook:one"),
        ),
        patch(
            "api.routers.chat.build_notebook_context",
            new_callable=AsyncMock,
            return_value=({"sources": [], "notes": []}, "Base context"),
        ),
    ):
        response = client.post(
            "/api/chat/context",
            json={
                "notebook_id": "notebook:one",
                "context_config": {"sources": {}, "notes": {}},
            },
        )

    assert response.status_code == 200
    assert response.json()["learning_updates_omitted"] == 0
    assert "learning_updates" not in response.json()["context"]


def test_execute_chat_sends_and_links_only_updates_within_the_budget(client):
    updates = [_priced_update("old", 300, 1), _priced_update("new", 300, 2)]
    with _journey_with_updates(updates, 400):
        response, model_context, _, mark_applied = _execute_main_chat(
            client, {}, notebook_rows=[{"out": "notebook:one"}]
        )

    assert response.status_code == 200
    assert model_context["learning_updates"] == [{"conclusion": "new cost=300"}]
    # The update left out was not used, so it is not linked to this reply.
    assert mark_applied.await_args is not None
    assert [update.id for update in mark_applied.await_args.args[0]] == [
        "learning_update:new"
    ]


@pytest.mark.parametrize(
    ("accepted", "expected"),
    [
        ([], None),
        (["kept"], [{"conclusion": "kept cost=10"}]),
    ],
    ids=["nothing-accepted", "one-accepted"],
)
def test_execute_chat_with_null_learning_updates_uses_the_server_copy(
    client, accepted, expected
):
    """`"learning_updates": null` once failed the turn with a 500."""
    updates = [_priced_update(name, 10, 1) for name in accepted]
    request_context: dict[str, Any] = {
        "sources": [],
        "learning_updates": None,
        "learning_updates_instruction": None,
    }
    with _journey_with_updates(updates, 4_000):
        response, model_context, load_learning, _ = _execute_main_chat(
            client, request_context, notebook_rows=[{"out": "notebook:one"}]
        )

    assert response.status_code == 200
    load_learning.assert_awaited_once()
    assert model_context.get("learning_updates") == expected
    assert model_context["sources"] == []
    if expected is None:
        assert "learning_updates_instruction" not in model_context


# --- Including a conclusion in main chat, or leaving it out ------------------


def _update_row(update_id: str, version: int, **fields):
    row = {
        "id": update_id,
        "aside": "learning_aside:aside",
        "conclusion": f"Conclusion v{version}",
        "include_in_main": True,
        "version": version,
        "created": NOW,
        "updated": NOW,
    }
    row.update(fields)
    return row


def test_patch_update_leaves_the_latest_conclusion_out_of_main_chat(client):
    latest = LearningUpdate(**_update_row("learning_update:v2", 2))
    versions = [
        _update_row("learning_update:v1", 1),
        _update_row("learning_update:v2", 2),
    ]
    stored = _update_row("learning_update:v2", 2, include_in_main=False)
    with (
        patch(
            "api.routers.learning.LearningUpdate.get",
            new_callable=AsyncMock,
            return_value=latest,
        ) as get_update,
        patch(
            "open_notebook.domain.learning.repo_query",
            new_callable=AsyncMock,
            side_effect=[versions, [stored]],
        ) as repo_query,
    ):
        response = client.patch(
            "/api/learning/updates/v2", json={"include_in_main": False}
        )

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == "learning_update:v2"
    assert body["include_in_main"] is False
    assert body["superseded"] is False
    assert body["version"] == 2
    get_update.assert_awaited_once_with("learning_update:v2")
    # Changed in place: one write to that record, no new version.
    write_query, write_params = repo_query.await_args_list[-1].args
    assert write_query.startswith("UPDATE $update_id SET include_in_main")
    assert str(write_params["update_id"]) == "learning_update:v2"
    assert write_params["include_in_main"] is False


def test_patch_update_rejects_a_superseded_version(client):
    superseded = LearningUpdate(**_update_row("learning_update:v1", 1))
    versions = [
        _update_row("learning_update:v1", 1),
        _update_row("learning_update:v2", 2),
    ]
    with (
        patch(
            "api.routers.learning.LearningUpdate.get",
            new_callable=AsyncMock,
            return_value=superseded,
        ),
        patch(
            "open_notebook.domain.learning.repo_query",
            new_callable=AsyncMock,
            side_effect=[versions],
        ) as repo_query,
    ):
        response = client.patch(
            "/api/learning/updates/learning_update:v1",
            json={"include_in_main": False},
        )

    assert response.status_code == 400
    assert "replaced by version 2" in response.json()["detail"]
    assert "Only the latest version" in response.json()["detail"]
    # Nothing is written.
    assert repo_query.await_count == 1


def test_patch_unknown_update_returns_404(client):
    with patch(
        "open_notebook.domain.base.repo_query",
        new_callable=AsyncMock,
        return_value=[],
    ):
        response = client.patch(
            "/api/learning/updates/missing", json={"include_in_main": True}
        )

    assert response.status_code == 404


def test_patch_update_requires_include_in_main(client):
    response = client.patch("/api/learning/updates/v2", json={})

    assert response.status_code == 422


# --- Deleting chat sessions ------------------------------------------------------


def _delete_session(client, session, aside=None, journey=None):
    """DELETE /api/chat/sessions/{id} with the lookups mocked out."""
    from open_notebook.domain.notebook import ChatSession

    with (
        patch(
            "api.routers.chat.get_session_or_404",
            new_callable=AsyncMock,
            return_value=(session.id, session),
        ),
        patch.object(
            LearningAside,
            "get_for_chat_session",
            new_callable=AsyncMock,
            return_value=aside,
        ),
        patch.object(
            LearningJourney,
            "get_for_main_session",
            new_callable=AsyncMock,
            return_value=journey,
        ),
        patch.object(
            LearningJourney, "delete_with_asides", new_callable=AsyncMock
        ) as cascade,
        patch.object(ChatSession, "delete", new_callable=AsyncMock) as delete,
    ):
        response = client.delete(f"/api/chat/sessions/{session.id}")
    return response, cascade, delete


@pytest.mark.parametrize(
    ("kind", "has_aside"),
    [
        ("learning_aside", True),
        # Marked as an aside's session, but its aside is gone.
        ("learning_aside", False),
        # An aside's session stored before sessions carried a kind.
        ("chat", True),
    ],
)
def test_deleting_an_aside_session_is_refused(client, kind, has_aside):
    from open_notebook.domain.notebook import ChatSession

    session = ChatSession(id="chat_session:child", title="Aside", kind=kind)

    response, cascade, delete = _delete_session(
        client, session, aside=_aside() if has_aside else None
    )

    assert response.status_code == 400
    assert "Discard the aside instead" in response.json()["detail"]
    cascade.assert_not_called()
    delete.assert_not_called()


def test_deleting_a_main_session_removes_its_journey(client):
    from open_notebook.domain.notebook import ChatSession

    session = ChatSession(id="chat_session:main", title="Main")

    response, cascade, delete = _delete_session(client, session, journey=_journey())

    assert response.status_code == 200
    cascade.assert_awaited_once()
    delete.assert_awaited_once()


# --- Accepted conclusions in an aside turn --------------------------------------


@contextmanager
def _journey_conclusions(updates):
    """The main-session journey's accepted updates, as the real loader sees them."""
    with (
        patch(
            "api.routers._chat_shared.LearningJourney.get_for_main_session",
            new_callable=AsyncMock,
            return_value=_journey(),
        ) as get_journey,
        patch(
            "api.routers._chat_shared.LearningJourney.get_updates",
            new_callable=AsyncMock,
            return_value=list(updates),
        ) as get_updates,
        patch("api.routers._chat_shared.token_count", new=_fake_token_count),
    ):
        yield get_journey, get_updates


def test_aside_turn_gets_accepted_conclusions_from_the_server(client):
    accepted = _priced_update("accepted", 10, 1, citations=["source:paper"])
    # A stale or edited copy the client sends along.
    request_context = {
        "sources": [{"id": "source:paper"}],
        "learning_updates": [
            {"id": "learning_update:forged", "conclusion": "Not accepted"}
        ],
        "learning_updates_instruction": "Cite learning_update IDs freely.",
    }
    captured: dict[str, Any] = {}
    with _journey_conclusions([accepted]) as (get_journey, get_updates):
        response, _, _ = _send_aside_message(
            client,
            _aside(),
            _journey(),
            captured,
            context=request_context,
            learning=REAL_LOADER,
        )

    assert response.status_code == 200
    context = captured["context"]
    assert context["learning_updates"] == [
        {"conclusion": "accepted cost=10", "citations": ["source:paper"]}
    ]
    assert "Never expose or cite" in context["learning_updates_instruction"]
    assert "Not accepted" not in str(context)
    assert "learning_update:" not in str(context["learning_updates"])
    assert context["sources"] == [{"id": "source:paper"}]
    # The aside's journey: its main session's accepted conclusions.
    get_journey.assert_awaited_once_with("chat_session:main")
    get_updates.assert_awaited_once_with(include_unmerged=False)


def test_aside_turn_without_accepted_conclusions_drops_the_client_copy(client):
    request_context = {
        "learning_updates": [{"id": "learning_update:old", "conclusion": "Excluded"}],
        "learning_updates_instruction": "Use these.",
    }
    captured: dict[str, Any] = {}
    with _journey_conclusions([]):
        response, _, _ = _send_aside_message(
            client,
            _aside(),
            _journey(),
            captured,
            context=request_context,
            learning=REAL_LOADER,
        )

    assert response.status_code == 200
    assert "learning_updates" not in captured["context"]
    assert "learning_updates_instruction" not in captured["context"]


def test_aside_turn_conclusions_share_the_main_chat_budget(client):
    updates = [_priced_update("old", 300, 1), _priced_update("new", 300, 2)]
    captured: dict[str, Any] = {}
    with (
        _journey_conclusions(updates),
        patch("api.routers._chat_shared.LEARNING_UPDATES_TOKEN_BUDGET", 400),
    ):
        response, _, _ = _send_aside_message(
            client, _aside(), _journey(), captured, learning=REAL_LOADER
        )

    assert response.status_code == 200
    assert captured["context"]["learning_updates"] == [{"conclusion": "new cost=300"}]
