"""Notebook endpoints accept bare IDs and never answer a bad ID with a 500.

`GET /api/notebooks/ti9hap78qut3sezzp1p4` (no `notebook:` prefix) used to reach
`RecordID.parse()`, which raises `ValueError`, so the router's catch-all
returned 500. IDs are now normalized to `notebook:<id>` (as the chat and
learning routers do), and an ID that still can't form a record ID is a 404.
"""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from surrealdb import RecordID

from api.routers.notebooks import _notebook_id
from open_notebook.exceptions import NotFoundError

NOTEBOOK_ROW = {
    "id": "notebook:ti9hap78qut3sezzp1p4",
    "name": "Research",
    "description": "",
    "archived": False,
    "created": "2026-01-01",
    "updated": "2026-01-01",
    "source_count": 0,
    "note_count": 0,
}


@pytest.fixture
def client():
    from api.main import app

    return TestClient(app)


def test_notebook_id_adds_missing_prefix():
    assert _notebook_id("ti9hap78qut3sezzp1p4") == "notebook:ti9hap78qut3sezzp1p4"
    assert _notebook_id("notebook:abc") == "notebook:abc"


def test_unparseable_notebook_id_is_not_found():
    with pytest.raises(NotFoundError):
        _notebook_id("notebook:a:b")


@patch("api.routers.notebooks.repo_query", new_callable=AsyncMock)
def test_get_notebook_accepts_bare_id(mock_repo_query, client):
    mock_repo_query.side_effect = [[NOTEBOOK_ROW], []]

    response = client.get("/api/notebooks/ti9hap78qut3sezzp1p4")

    assert response.status_code == 200
    assert response.json()["id"] == "notebook:ti9hap78qut3sezzp1p4"
    bound = mock_repo_query.await_args_list[0].args[1]["notebook_id"]
    assert bound == RecordID("notebook", "ti9hap78qut3sezzp1p4")


@patch("api.routers.notebooks.repo_query", new_callable=AsyncMock)
def test_get_missing_bare_id_returns_404(mock_repo_query, client):
    mock_repo_query.return_value = []

    assert client.get("/api/notebooks/doesnotexist").status_code == 404


@patch("api.routers.notebooks.repo_query", new_callable=AsyncMock)
def test_get_malformed_id_returns_404_without_querying(mock_repo_query, client):
    response = client.get("/api/notebooks/notebook:a:b")

    assert response.status_code == 404
    mock_repo_query.assert_not_awaited()


@patch("api.routers.notebooks.Notebook.get", new_callable=AsyncMock)
def test_mutating_endpoints_normalize_bare_id(mock_get, client):
    mock_get.side_effect = NotFoundError("not found")

    client.get("/api/notebooks/abc/delete-preview")
    client.put("/api/notebooks/abc", json={"name": "x"})
    client.delete("/api/notebooks/abc")
    client.post("/api/notebooks/abc/sources/xyz")
    client.delete("/api/notebooks/abc/sources/xyz")

    assert mock_get.await_count == 5
    assert {call.args[0] for call in mock_get.await_args_list} == {"notebook:abc"}


def test_notes_filter_normalizes_bare_notebook_id(client):
    with patch(
        "open_notebook.domain.notebook.Notebook.get", new_callable=AsyncMock
    ) as domain_get:
        domain_get.side_effect = NotFoundError("not found")

        response = client.get("/api/notes", params={"notebook_id": "abc"})

    assert response.status_code == 404
    domain_get.assert_awaited_once_with("notebook:abc")


@patch("api.routers.sources.Notebook.get", new_callable=AsyncMock)
def test_sources_filter_normalizes_bare_notebook_id(mock_get, client):
    mock_get.side_effect = NotFoundError("not found")

    response = client.get("/api/sources", params={"notebook_id": "abc"})

    assert response.status_code == 404
    mock_get.assert_awaited_once_with("notebook:abc")
