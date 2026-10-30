"""Linking a source to a notebook is idempotent.

`RELATE $source_id->reference->$notebook_id` stores ``in`` = source and
``out`` = notebook. The duplicate check in `add_source_to_notebook` used to
query ``out = $source_id AND in = $notebook_id``, which never matches, so each
re-add created another `reference` row. The fake below stores edges the way
SurrealDB does and evaluates the routers' WHERE clauses against them, so the
link, duplicate check and unlink queries must all agree on the direction.
"""

import re
from typing import Any, Dict, List
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from surrealdb import RecordID

_RELATE = re.compile(r"^RELATE \$(\w+)->reference->\$(\w+)$")
_WHERE = re.compile(
    r"^(SELECT \* FROM|DELETE FROM) reference "
    r"WHERE (in|out) = \$(\w+) AND (in|out) = \$(\w+)$"
)


class FakeReferenceTable:
    def __init__(self) -> None:
        self.rows: List[Dict[str, RecordID]] = []

    async def query(self, sql: str, params: Dict[str, Any]) -> List[Dict[str, Any]]:
        sql = " ".join(sql.split())
        relate = _RELATE.match(sql)
        if relate:
            row = {"in": params[relate.group(1)], "out": params[relate.group(2)]}
            self.rows.append(row)
            return [row]
        where = _WHERE.match(sql)
        assert where, f"unexpected query: {sql}"
        verb, field_a, param_a, field_b, param_b = where.groups()
        matches = [
            row
            for row in self.rows
            if row[field_a] == params[param_a] and row[field_b] == params[param_b]
        ]
        if verb.startswith("DELETE"):
            self.rows = [row for row in self.rows if row not in matches]
            return []
        return matches


@pytest.fixture
def client():
    from api.main import app

    return TestClient(app)


@pytest.fixture
def table():
    table = FakeReferenceTable()
    with (
        patch("api.routers.notebooks.repo_query", new=table.query),
        patch("api.routers.notebooks.Notebook.get", new_callable=AsyncMock),
        patch("api.routers.notebooks.Source.get", new_callable=AsyncMock),
    ):
        yield table


def test_re_adding_a_source_does_not_duplicate_the_reference(client, table):
    for _ in range(3):
        response = client.post("/api/notebooks/nb1/sources/src1")
        assert response.status_code == 200

    assert table.rows == [
        {"in": RecordID("source", "src1"), "out": RecordID("notebook", "nb1")}
    ]


def test_each_notebook_gets_its_own_reference(client, table):
    client.post("/api/notebooks/nb1/sources/src1")
    client.post("/api/notebooks/nb2/sources/src1")
    client.post("/api/notebooks/nb1/sources/src2")

    assert len(table.rows) == 3


def test_unlink_removes_the_reference_the_link_created(client, table):
    client.post("/api/notebooks/nb1/sources/src1")
    client.post("/api/notebooks/nb2/sources/src1")

    response = client.delete("/api/notebooks/nb1/sources/src1")

    assert response.status_code == 200
    assert table.rows == [
        {"in": RecordID("source", "src1"), "out": RecordID("notebook", "nb2")}
    ]
    # Linking again after an unlink works.
    client.post("/api/notebooks/nb1/sources/src1")
    assert len(table.rows) == 2
