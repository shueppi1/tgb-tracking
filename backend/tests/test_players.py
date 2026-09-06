from tests.conftest import make_player


def test_create_and_list(client, auth):
    p = make_player(client, auth)
    assert p["id"] and p["active"] is True and p["number"] == 7
    res = client.get("/api/players", headers=auth)
    assert [x["id"] for x in res.get_json()["players"]] == [p["id"]]


def test_validation(client, auth):
    bad = {"firstName": "A", "lastName": "B", "displayName": "", "number": 7, "position": "field"}
    assert client.post("/api/players", json=bad, headers=auth).status_code == 400
    bad["displayName"] = "X"
    bad["number"] = 150
    assert client.post("/api/players", json=bad, headers=auth).status_code == 400
    bad["number"] = 5
    bad["position"] = "striker"
    assert client.post("/api/players", json=bad, headers=auth).status_code == 400


def test_duplicate_number_rejected_until_retired(client, auth):
    p = make_player(client, auth, number=9)
    res = client.post(
        "/api/players",
        json={"firstName": "B", "lastName": "C", "displayName": "B", "number": 9,
              "position": "field"},
        headers=auth,
    )
    assert res.status_code == 400
    assert "vergeben" in res.get_json()["error"]

    res = client.patch(f"/api/players/{p['id']}", json={"active": False}, headers=auth)
    assert res.status_code == 200 and res.get_json()["player"]["active"] is False

    res = client.post(
        "/api/players",
        json={"firstName": "B", "lastName": "C", "displayName": "B", "number": 9,
              "position": "field"},
        headers=auth,
    )
    assert res.status_code == 201

    # Re-activating the retired player with the now taken number fails.
    res = client.patch(f"/api/players/{p['id']}", json={"active": True}, headers=auth)
    assert res.status_code == 400


def test_active_filter(client, auth):
    a = make_player(client, auth, number=1)
    b = make_player(client, auth, number=2, displayName="B")
    client.patch(f"/api/players/{b['id']}", json={"active": False}, headers=auth)
    active = client.get("/api/players?active=true", headers=auth).get_json()["players"]
    assert [p["id"] for p in active] == [a["id"]]
    everyone = client.get("/api/players", headers=auth).get_json()["players"]
    assert len(everyone) == 2


def test_patch_unknown(client, auth):
    res = client.patch("/api/players/nope", json={"active": False}, headers=auth)
    assert res.status_code == 404
