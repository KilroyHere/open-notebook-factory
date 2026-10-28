"""API coverage for learning-aside lifecycle and context integration."""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from api.models import LearningAsideResponse, LearningJourneyResponse
from open_notebook.domain.learning import (
    AsideAnchor,
    LearningAside,
    LearningJourney,
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
async def test_resume_prioritizes_active_aside(client):
    journey = _journey(active_session="chat_session:child")
    aside = _aside()
    journey_response = LearningJourneyResponse(
        id=journey.id or "",
        notebook_id=journey.notebook,
        main_session_id=journey.main_session,
        active_session_id=aside.chat_session,
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
