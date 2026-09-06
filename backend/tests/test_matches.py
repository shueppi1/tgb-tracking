import io
import zipfile


def ops(client, auth, match_id, *op_list):
    res = client.post(f"/api/matches/{match_id}/ops", json={"ops": list(op_list)}, headers=auth)
    assert res.status_code == 200, res.get_json()
    return res.get_json()


def add_event(op_id, event_id, ev_type, player_id=None, half=1, seconds=60):
    return {
        "opId": op_id,
        "kind": "add_event",
        "event": {
            "eventId": event_id,
            "type": ev_type,
            "half": half,
            "clockSeconds": seconds,
            "playerId": player_id,
            "recordedAt": "2026-09-06T17:01:00Z",
        },
    }


def clock_op(op_id, action, at, **extra):
    return {"opId": op_id, "kind": "clock", "action": action, "at": at, **extra}


def test_create_match_snapshots_roster(client, auth, roster, match):
    assert match["status"] == "running"
    assert match["season"] == "2026/27"
    assert match["clock"] == {"half": 1, "running": False, "baseSeconds": 0, "startedAt": None}
    ids = {m["playerId"] for m in match["roster"]}
    assert ids == {p["id"] for p in roster.values()}
    # Field players first, sorted by number, then goalkeepers.
    assert [m["number"] for m in match["roster"]] == [7, 10, 1]

    # Renaming the player afterwards does not change the snapshot.
    client.patch(f"/api/players/{roster['max']['id']}", json={"displayName": "Maxi"}, headers=auth)
    reloaded = client.get(f"/api/matches/{match['id']}", headers=auth).get_json()["match"]
    assert reloaded["roster"][0]["displayName"] == "Max"


def test_create_match_validation(client, auth, roster):
    base = {"opponent": "X", "kickoff": "2026-09-06T17:00:00Z"}
    r = client.post("/api/matches", json={**base, "playerIds": []}, headers=auth)
    assert r.status_code == 400
    only_field = [roster["max"]["id"]]
    only_keeper = [roster["timo"]["id"]]
    r = client.post("/api/matches", json={**base, "playerIds": only_field}, headers=auth)
    assert r.status_code == 400 and "Torwart" in r.get_json()["error"]
    r = client.post("/api/matches", json={**base, "playerIds": only_keeper}, headers=auth)
    assert r.status_code == 400 and "Feldspieler" in r.get_json()["error"]
    r = client.post("/api/matches", json={**base, "opponent": "", "playerIds": only_field},
                    headers=auth)
    assert r.status_code == 400


def test_add_event_is_idempotent(client, auth, roster, match):
    op = add_event("op1", "ev1", "TOR", roster["max"]["id"])
    first = ops(client, auth, match["id"], op)
    assert first["applied"] == ["op1"] and len(first["match"]["events"]) == 1
    # Same op replayed (lost ack) → acknowledged, not duplicated.
    again = ops(client, auth, match["id"], op)
    assert again["applied"] == ["op1"] and len(again["match"]["events"]) == 1
    # Same event under a *different* opId (client re-queued) → still not duplicated.
    again2 = ops(client, auth, match["id"], {**op, "opId": "op1b"})
    assert len(again2["match"]["events"]) == 1


def test_event_target_validation(client, auth, roster, match):
    mid = match["id"]
    res = ops(client, auth, mid,
              add_event("a", "e1", "ANGRIFF_PLUS", roster["max"]["id"]),   # team event w/ player
              add_event("b", "e2", "DEF_PLUS", roster["timo"]["id"]),      # field-only on keeper
              add_event("c", "e3", "GEHALTEN_6M", roster["max"]["id"]),    # keeper-only on field
              add_event("d", "e4", "TOR"),                                  # missing player
              add_event("e", "e5", "TOR", roster["timo"]["id"]),           # keeper may score
              add_event("f", "e6", "GEHALTEN_7M", roster["timo"]["id"]),
              add_event("g", "e7", "ABWEHR_MINUS"),
              add_event("h", "e8", "UNBEKANNT"))
    assert res["applied"] == ["e", "f", "g"]
    assert {r["opId"] for r in res["rejected"]} == {"a", "b", "c", "d", "h"}
    assert len(res["match"]["events"]) == 3


def test_delete_event_and_replay(client, auth, roster, match):
    mid = match["id"]
    ops(client, auth, mid, add_event("a", "e1", "TOR", roster["max"]["id"]),
        add_event("b", "e2", "ASSIST", roster["leo"]["id"]))
    res = ops(client, auth, mid, {"opId": "c", "kind": "delete_event", "eventId": "e1"})
    assert [e["eventId"] for e in res["match"]["events"]] == ["e2"]
    res = ops(client, auth, mid, {"opId": "c", "kind": "delete_event", "eventId": "e1"})
    assert res["applied"] == ["c"]


def test_clock_ops_replay_does_not_double_count(client, auth, match):
    mid = match["id"]
    batch = [clock_op("s1", "start", "2026-09-06T17:00:00Z"),
             clock_op("s2", "stop", "2026-09-06T17:01:30Z")]
    res = ops(client, auth, mid, *batch)
    assert res["match"]["clock"] == {"half": 1, "running": False, "baseSeconds": 90,
                                     "startedAt": None}
    res = ops(client, auth, mid, *batch)  # retried batch
    assert res["match"]["clock"]["baseSeconds"] == 90

    res = ops(client, auth, mid, clock_op("s3", "start", "2026-09-06T17:05:00Z"))
    assert res["match"]["clock"]["running"] is True
    assert res["match"]["clock"]["startedAt"] == "2026-09-06T17:05:00Z"
    res = ops(client, auth, mid, clock_op("s4", "end_half", "2026-09-06T17:31:00Z"))
    assert res["match"]["clock"] == {"half": 2, "running": False, "baseSeconds": 1800,
                                     "startedAt": None}
    res = ops(client, auth, mid, clock_op("s5", "correct", "2026-09-06T17:31:00Z", seconds=1815))
    assert res["match"]["clock"]["baseSeconds"] == 1815
    bad = ops(client, auth, mid, clock_op("s6", "correct", "2026-09-06T17:31:00Z"))
    assert bad["rejected"][0]["opId"] == "s6"


def test_finish_stops_clock_and_blocks_ops(client, auth, roster, match):
    mid = match["id"]
    ops(client, auth, mid, clock_op("s1", "start", "2026-09-06T17:00:00Z"))
    res = client.post(f"/api/matches/{mid}/finish", headers=auth)
    assert res.status_code == 200
    assert res.get_json()["match"]["status"] == "finished"
    assert res.get_json()["match"]["clock"]["running"] is False
    res = client.post(f"/api/matches/{mid}/ops",
                      json={"ops": [add_event("x", "e1", "TOR", roster["max"]["id"])]},
                      headers=auth)
    assert res.status_code == 409
    listing = client.get("/api/matches?status=finished", headers=auth).get_json()["matches"]
    assert [m["id"] for m in listing] == [mid]
    assert "events" not in listing[0] and listing[0]["score"] == {"own": 0, "opponent": 0}
    assert client.post(f"/api/matches/{mid}/reopen", headers=auth).get_json()["match"]["status"] \
        == "running"


def test_summary_and_exports(client, auth, roster, match):
    mid = match["id"]
    ops(client, auth, mid,
        add_event("a", "e1", "TOR", roster["max"]["id"], seconds=65),
        add_event("b", "e2", "TOR", roster["max"]["id"], half=2, seconds=1900),
        add_event("c", "e3", "ASSIST", roster["leo"]["id"], seconds=70),
        add_event("d", "e4", "GEHALTEN_6M", roster["timo"]["id"], seconds=100),
        add_event("e", "e5", "GGTOR_7M", roster["timo"]["id"], seconds=200),
        add_event("f", "e6", "GGTOR_9M", roster["timo"]["id"], seconds=300),
        add_event("g", "e7", "TEMPO_PLUS", seconds=400))
    summary = client.get(f"/api/matches/{mid}/summary", headers=auth).get_json()["summary"]
    assert summary["score"] == {"own": 2, "opponent": 2}
    assert summary["team"]["TEMPO_PLUS"] == 1 and summary["team"]["ANGRIFF_PLUS"] == 0
    by_id = {p["playerId"]: p for p in summary["players"]}
    assert by_id[roster["max"]["id"]]["counts"]["TOR"] == 2
    assert by_id[roster["leo"]["id"]]["counts"]["ASSIST"] == 1
    assert len(summary["goalkeepers"]) == 1
    keeper = summary["goalkeepers"][0]
    assert keeper["saves"] == 1 and keeper["conceded"] == 2 and keeper["savePct"] == 33.3

    res = client.get(f"/api/matches/{mid}/export/events.csv", headers=auth)
    assert res.status_code == 200
    text = res.data.decode("utf-8")
    assert text.startswith("\ufeff")
    lines = text.lstrip("\ufeff").splitlines()
    assert lines[0].split(";")[:4] == ["Nr", "Halbzeit", "Spielzeit", "Ereignis"]
    assert len(lines) == 8
    assert lines[1].split(";")[1:6] == ["1", "01:05", "Tor", "7", "Max"]
    assert lines[-1].split(";")[1:4] == ["2", "31:40", "Tor"]
    assert 'filename="2026-09-06_HSG-Test_ereignisse.csv"' in res.headers["Content-Disposition"]

    text = client.get(f"/api/matches/{mid}/export/players.csv", headers=auth).data.decode()
    lines = text.lstrip("\ufeff").splitlines()
    assert lines[0].split(";")[:4] == ["Nummer", "Anzeigename", "Position", "Tor"]
    assert lines[1].split(";")[:4] == ["7", "Max", "Spieler", "2"]
    assert len(lines) == 4  # header + 3 roster members

    text = client.get(f"/api/matches/{mid}/export/goalkeepers.csv", headers=auth).data.decode()
    lines = text.lstrip("\ufeff").splitlines()
    assert lines[0].split(";")[-1] == "Quote %"
    assert lines[1].split(";")[-4:] == ["1", "2", "3", "33,3"]

    res = client.get(f"/api/matches/{mid}/export.zip", headers=auth)
    assert res.status_code == 200
    with zipfile.ZipFile(io.BytesIO(res.data)) as zf:
        assert sorted(zf.namelist()) == [
            "2026-09-06_HSG-Test_ereignisse.csv",
            "2026-09-06_HSG-Test_spieler.csv",
            "2026-09-06_HSG-Test_torhueter.csv",
        ]


def test_patch_and_delete_match(client, auth, match):
    mid = match["id"]
    res = client.patch(f"/api/matches/{mid}", json={"opponent": "Neu", "homeAway": "away"},
                       headers=auth)
    assert res.get_json()["match"]["opponent"] == "Neu"
    assert client.delete(f"/api/matches/{mid}", headers=auth).status_code == 200
    assert client.get(f"/api/matches/{mid}", headers=auth).status_code == 404
