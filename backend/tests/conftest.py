import json
from pathlib import Path

import mongomock
import pytest

from app import create_app

FIXTURES = Path(__file__).resolve().parents[2] / "shared" / "fixtures"


@pytest.fixture
def db():
    return mongomock.MongoClient(tz_aware=True)["tgb_test"]


@pytest.fixture
def app(db):
    return create_app(
        {"TESTING": True, "APP_PASSWORD": "geheim", "SECRET_KEY": "test-secret"}, db=db
    )


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def auth(client):
    res = client.post("/api/auth/login", json={"password": "geheim"})
    assert res.status_code == 200, res.get_json()
    return {"Authorization": f"Bearer {res.get_json()['token']}"}


@pytest.fixture
def sample_match():
    with (FIXTURES / "sample-match.json").open(encoding="utf-8") as fh:
        return json.load(fh)


def make_player(client, auth, **overrides):
    payload = {
        "firstName": "Max",
        "lastName": "Mustermann",
        "displayName": "Max",
        "number": 7,
        "position": "field",
    }
    payload.update(overrides)
    res = client.post("/api/players", json=payload, headers=auth)
    assert res.status_code == 201, res.get_json()
    return res.get_json()["player"]


@pytest.fixture
def roster(client, auth):
    """Two field players and one goalkeeper."""
    return {
        "max": make_player(client, auth, displayName="Max", number=7),
        "leo": make_player(client, auth, firstName="Leo", displayName="Leo", number=10),
        "timo": make_player(
            client, auth, firstName="Timo", displayName="Timo", number=1, position="goalkeeper"
        ),
    }


@pytest.fixture
def match(client, auth, roster):
    res = client.post(
        "/api/matches",
        json={
            "opponent": "HSG Test",
            "kickoff": "2026-09-06T17:00:00Z",
            "playerIds": [p["id"] for p in roster.values()],
        },
        headers=auth,
    )
    assert res.status_code == 201, res.get_json()
    return res.get_json()["match"]
