"""API coverage for learning-aside lifecycle and context integration."""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from api.models import LearningAsideResponse, LearningJourneyResponse
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

    async def save_session(session):
        session.id = "chat_session:child"
        session.created = NOW
        session.updated = NOW

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
    relate.assert_awaited_once_with("notebook:one")
    save_journey.assert_awaited_once()


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

    async def save_update(update):
        update.id = "learning_update:second"
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
            "api.routers.learning.LearningAside.get_updates",
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


@pytest.mark.asyncio
async def test_main_response_links_learning_update_back_to_message():
    update = LearningUpdate(
        id="learning_update:one",
        aside="learning_aside:one",
        conclusion="Accepted conclusion",
        include_in_main=True,
    )
    journey = _journey()
    with (
        patch(
            "api.routers.chat.LearningJourney.get_for_main_session",
            new_callable=AsyncMock,
            return_value=journey,
        ),
        patch(
            "open_notebook.domain.learning.LearningJourney.get_updates",
            new_callable=AsyncMock,
            return_value=[update],
        ),
        patch(
            "open_notebook.domain.learning.LearningUpdate.save",
            new_callable=AsyncMock,
        ) as save_update,
    ):
        await _mark_learning_updates_applied(
            "chat_session:main",
            {"learning_updates": [{"id": "learning_update:one"}]},
            {
                "messages": [
                    SimpleNamespace(id="human:one", type="human"),
                    SimpleNamespace(id="ai:merged-response", type="ai"),
                ]
            },
        )

    assert update.applied_message_id == "ai:merged-response"
    save_update.assert_awaited_once()
