"""Model-drafted aside resolutions, with the chat model mocked."""

import json
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage, HumanMessage

from open_notebook.domain.learning import AsideAnchor, LearningAside, LearningUpdate
from open_notebook.exceptions import ConfigurationError, ExternalServiceError
from open_notebook.graphs.learning_resolution import (
    document_citations,
    draft_learning_resolution,
    sanitize_draft_text,
)

NOW = datetime(2026, 10, 29, tzinfo=timezone.utc)
MESSAGE_ID = "3f1c2b9e-5d1a-4c3e-9a71-0b1f2c3d4e5f"

TRANSCRIPT = [
    {"role": "human", "content": "Why does Jensen's inequality apply here?"},
    {
        "role": "ai",
        "content": (
            "Because log is concave, E[log X] <= log E[X], which turns the "
            "evidence into a lower bound [source:paper]."
        ),
    },
]


def _model_returning(payload):
    content = payload if isinstance(payload, str) else json.dumps(payload)
    model = SimpleNamespace(ainvoke=AsyncMock(return_value=AIMessage(content=content)))
    return model


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
        "context_snapshot": [
            {"id": "message-0", "role": "human", "content": "Derive the ELBO."},
            {
                "id": "message-1",
                "role": "ai",
                "content": "The ELBO follows from Jensen's inequality.",
            },
        ],
        "created": NOW,
        "updated": NOW,
    }
    values.update(overrides)
    return LearningAside(**values)


def test_document_citations_keeps_first_seen_order_without_duplicates():
    assert document_citations(
        "a [source:paper] b [note:margin] c [source:paper] [chat_session:x]"
    ) == ["source:paper", "note:margin"]


def test_sanitize_strips_internal_ids_and_unknown_citations():
    text = (
        "Jensen gives a bound [source:paper] [source:invented]. "
        "See [learning_aside:aside] and chat_session:child, "
        f"plus [{MESSAGE_ID}] and {MESSAGE_ID}."
    )

    cleaned = sanitize_draft_text(text, ["source:paper"], [MESSAGE_ID])

    assert cleaned == "Jensen gives a bound [source:paper]. See and, plus and."
    assert "learning_aside" not in cleaned
    assert "chat_session" not in cleaned
    assert MESSAGE_ID not in cleaned


def test_sanitize_never_removes_short_ids_from_prose():
    # A short context id must not eat ordinary words that contain it.
    assert sanitize_draft_text("The ai answered.", [], ["ai"]) == "The ai answered."


@pytest.mark.asyncio
async def test_draft_uses_the_aside_model_and_returns_a_cleaned_structured_draft():
    model = _model_returning(
        "<think>reasoning</think>"
        + json.dumps(
            {
                "conclusion": (
                    "Log is concave, so Jensen turns the evidence into a lower "
                    "bound [source:paper] [learning_update:old]."
                ),
                "relevance": "It justifies the first ELBO step [source:made_up].",
                "open_questions": [
                    "Why is the bound tight when q equals the posterior?",
                    "Why is the bound tight when q equals the posterior?",
                    "  ",
                    "When does the gap vanish?",
                    "What is the KL term?",
                    "A fourth question that should be dropped?",
                ],
            }
        )
    )
    with patch(
        "open_notebook.graphs.learning_resolution.provision_langchain_model",
        new_callable=AsyncMock,
        return_value=model,
    ) as provision:
        draft = await draft_learning_resolution(
            title="Why does Jensen's inequality apply?",
            anchor="The ELBO follows from Jensen's inequality.",
            parent_context=[{"role": "human", "content": "Derive the ELBO."}],
            transcript=TRANSCRIPT,
            model_id="model:aside",
        )

    assert provision.await_args is not None
    prompt, model_id, model_type = provision.await_args.args
    assert model_id == "model:aside"
    assert model_type == "chat"
    assert "Derive the ELBO." in prompt
    assert "The ELBO follows from Jensen's inequality." in prompt
    assert "[source:paper]" in prompt
    assert draft.conclusion == (
        "Log is concave, so Jensen turns the evidence into a lower bound "
        "[source:paper]."
    )
    assert draft.relevance == "It justifies the first ELBO step."
    assert draft.open_questions == [
        "Why is the bound tight when q equals the posterior?",
        "When does the gap vanish?",
        "What is the KL term?",
    ]


@pytest.mark.asyncio
async def test_unparseable_model_output_is_an_external_service_error():
    with patch(
        "open_notebook.graphs.learning_resolution.provision_langchain_model",
        new_callable=AsyncMock,
        return_value=_model_returning("I think you learned a lot!"),
    ):
        with pytest.raises(ExternalServiceError):
            await draft_learning_resolution(
                title="t",
                anchor="a",
                parent_context=[],
                transcript=TRANSCRIPT,
                model_id=None,
            )


@pytest.mark.asyncio
async def test_provider_failures_are_classified():
    model = SimpleNamespace(
        ainvoke=AsyncMock(side_effect=RuntimeError("model not found: gone"))
    )
    with patch(
        "open_notebook.graphs.learning_resolution.provision_langchain_model",
        new_callable=AsyncMock,
        return_value=model,
    ):
        with pytest.raises(ConfigurationError):
            await draft_learning_resolution(
                title="t",
                anchor="a",
                parent_context=[],
                transcript=TRANSCRIPT,
                model_id=None,
            )


# --- API -------------------------------------------------------------------


@pytest.fixture
def client():
    from api.main import app

    return TestClient(app)


def _raw_messages():
    return [
        HumanMessage(content=TRANSCRIPT[0]["content"], id="human-msg"),
        AIMessage(content=TRANSCRIPT[1]["content"], id=MESSAGE_ID),
    ]


def test_draft_endpoint_uses_session_model_and_hides_internal_ids(client):
    aside = _aside()
    draft = AsyncMock(
        return_value=SimpleNamespace(
            model_dump=lambda: {
                "conclusion": "Log is concave, so Jensen gives a lower bound.",
                "relevance": "It justifies the first ELBO step.",
                "open_questions": ["When is the bound tight?"],
            }
        )
    )
    with (
        patch(
            "api.routers.learning._get_aside",
            new_callable=AsyncMock,
            return_value=aside,
        ),
        patch(
            "api.routers.learning._raw_session_messages",
            new_callable=AsyncMock,
            return_value=_raw_messages(),
        ),
        patch(
            "api.routers.learning.ChatSession.get",
            new_callable=AsyncMock,
            return_value=SimpleNamespace(model_override="model:session"),
        ),
        patch(
            "api.routers.learning.LearningAside.get_updates",
            new_callable=AsyncMock,
            return_value=[
                LearningUpdate(
                    id="learning_update:first",
                    aside=aside.id or "",
                    conclusion="Earlier",
                )
            ],
        ),
        patch("api.routers.learning.draft_learning_resolution", new=draft),
    ):
        response = client.post("/api/learning/asides/aside/draft-resolution")

    assert response.status_code == 200
    assert response.json() == {
        "conclusion": "Log is concave, so Jensen gives a lower bound.",
        "relevance": "It justifies the first ELBO step.",
        "open_questions": ["When is the bound tight?"],
    }
    assert draft.await_args is not None
    kwargs = draft.await_args.kwargs
    assert kwargs["model_id"] == "model:session"
    assert kwargs["anchor"] == aside.anchor.content
    assert kwargs["parent_context"] == aside.context_snapshot
    assert [turn["role"] for turn in kwargs["transcript"]] == ["human", "ai"]
    for internal_id in (
        "learning_aside:aside",
        "chat_session:child",
        "chat_session:main",
        "learning_update:first",
        MESSAGE_ID,
        "message-1",
    ):
        assert internal_id in kwargs["internal_ids"]


def test_draft_endpoint_prefers_an_explicit_model_override(client):
    draft = AsyncMock(
        return_value=SimpleNamespace(
            model_dump=lambda: {
                "conclusion": "c",
                "relevance": "",
                "open_questions": [],
            }
        )
    )
    with (
        patch(
            "api.routers.learning._get_aside",
            new_callable=AsyncMock,
            return_value=_aside(),
        ),
        patch(
            "api.routers.learning._raw_session_messages",
            new_callable=AsyncMock,
            return_value=_raw_messages(),
        ),
        patch(
            "api.routers.learning.ChatSession.get",
            new_callable=AsyncMock,
            return_value=SimpleNamespace(model_override="model:session"),
        ),
        patch(
            "api.routers.learning.LearningAside.get_updates",
            new_callable=AsyncMock,
            return_value=[],
        ),
        patch("api.routers.learning.draft_learning_resolution", new=draft),
    ):
        response = client.post(
            "/api/learning/asides/aside/draft-resolution",
            json={"model_override": "model:picked"},
        )

    assert response.status_code == 200
    assert draft.await_args is not None
    assert draft.await_args.kwargs["model_id"] == "model:picked"


def test_draft_endpoint_requires_an_answer_to_summarize(client):
    draft = AsyncMock()
    with (
        patch(
            "api.routers.learning._get_aside",
            new_callable=AsyncMock,
            return_value=_aside(),
        ),
        patch(
            "api.routers.learning._raw_session_messages",
            new_callable=AsyncMock,
            return_value=[HumanMessage(content="Only a question", id="h")],
        ),
        patch("api.routers.learning.draft_learning_resolution", new=draft),
    ):
        response = client.post("/api/learning/asides/aside/draft-resolution")

    assert response.status_code == 400
    draft.assert_not_awaited()


def test_draft_endpoint_rejects_discarded_asides(client):
    with patch(
        "api.routers.learning._get_aside",
        new_callable=AsyncMock,
        return_value=_aside(status="discarded"),
    ):
        response = client.post("/api/learning/asides/aside/draft-resolution")

    assert response.status_code == 400


def test_draft_endpoint_surfaces_model_failures_as_typed_errors(client):
    with (
        patch(
            "api.routers.learning._get_aside",
            new_callable=AsyncMock,
            return_value=_aside(),
        ),
        patch(
            "api.routers.learning._raw_session_messages",
            new_callable=AsyncMock,
            return_value=_raw_messages(),
        ),
        patch(
            "api.routers.learning.ChatSession.get",
            new_callable=AsyncMock,
            return_value=SimpleNamespace(model_override=None),
        ),
        patch(
            "api.routers.learning.LearningAside.get_updates",
            new_callable=AsyncMock,
            return_value=[],
        ),
        patch(
            "api.routers.learning.draft_learning_resolution",
            new_callable=AsyncMock,
            side_effect=ExternalServiceError("no usable draft"),
        ),
    ):
        response = client.post("/api/learning/asides/aside/draft-resolution")

    assert response.status_code == 502
