def test_login_wrong_password(client):
    res = client.post("/api/auth/login", json={"password": "falsch"})
    assert res.status_code == 401


def test_login_ok(client):
    res = client.post("/api/auth/login", json={"password": "geheim"})
    assert res.status_code == 200
    assert res.get_json()["token"]


def test_protected_without_token(client):
    assert client.get("/api/players").status_code == 401
    bad = {"Authorization": "Bearer nonsense"}
    assert client.get("/api/players", headers=bad).status_code == 401


def test_protected_with_token(client, auth):
    assert client.get("/api/players", headers=auth).status_code == 200


def test_no_password_configured(db):
    from app import create_app

    app = create_app({"TESTING": True, "APP_PASSWORD": "", "APP_PASSWORD_HASH": ""}, db=db)
    res = app.test_client().post("/api/auth/login", json={"password": "x"})
    assert res.status_code == 503


def test_health_and_catalog_are_open(client):
    assert client.get("/api/health").status_code == 200
    data = client.get("/api/event-types").get_json()
    assert {e["id"] for e in data["events"]} >= {"TOR", "GEHALTEN_6M", "ANGRIFF_PLUS"}
