from app.events_catalog import load_catalog
from app.stats import match_summary, season_summary


def test_match_summary_matches_shared_fixture(sample_match):
    catalog = load_catalog()
    summary = match_summary(sample_match["match"], catalog)
    expected = sample_match["expected"]

    assert summary["score"] == expected["score"]
    assert summary["eventCount"] == expected["eventCount"]
    assert summary["team"] == expected["team"]

    players = {p["playerId"]: p["counts"] for p in summary["players"]}
    assert players == expected["players"]

    keepers = {k["playerId"]: k for k in summary["goalkeepers"]}
    assert set(keepers) == set(expected["goalkeepers"])
    for pid, exp in expected["goalkeepers"].items():
        got = keepers[pid]
        for key in ("saves", "conceded", "shots", "savePct"):
            assert got[key] == exp[key], (pid, key)
        assert got["counts"] == {k: v for k, v in exp.items() if k.isupper()}


def test_keeper_without_shots_has_no_percentage():
    catalog = load_catalog()
    match = {
        "roster": [{"playerId": "g", "displayName": "G", "number": 1, "position": "goalkeeper"}],
        "events": [],
    }
    keeper = match_summary(match, catalog)["goalkeepers"][0]
    assert keeper["savePct"] is None and keeper["shots"] == 0


def test_season_summary_aggregates_by_player_id(sample_match):
    catalog = load_catalog()
    m1 = sample_match["match"]
    # Second match: Max renumbered, only one keeper, one goal each side.
    m2 = {
        "kickoff": "2026-09-13T17:00:00Z",
        "roster": [
            {"playerId": "p1", "displayName": "Max", "number": 99, "position": "field"},
            {"playerId": "p3", "displayName": "Timo", "number": 1, "position": "goalkeeper"},
        ],
        "events": [
            {"eventId": "x1", "type": "TOR", "half": 1, "clockSeconds": 10, "playerId": "p1"},
            {"eventId": "x2", "type": "GGTOR_6M", "half": 1, "clockSeconds": 20, "playerId": "p3"},
            {"eventId": "x3", "type": "GEHALTEN_9M", "half": 1, "clockSeconds": 30,
             "playerId": "p3"},
            {"eventId": "x4", "type": "ANGRIFF_PLUS", "half": 1, "clockSeconds": 40,
             "playerId": None},
        ],
    }
    s = season_summary([m1, m2], catalog)
    assert s["games"] == 2
    assert s["record"] == {"wins": 1, "draws": 1, "losses": 0}
    assert s["score"] == {"own": 4, "opponent": 3}
    assert s["team"]["ANGRIFF_PLUS"] == 2

    players = {p["playerId"]: p for p in s["players"]}
    assert players["p1"]["games"] == 2 and players["p1"]["counts"]["TOR"] == 2
    assert players["p1"]["number"] == 99  # latest snapshot wins
    assert players["p2"]["games"] == 1
    keepers = {k["playerId"]: k for k in s["goalkeepers"]}
    assert keepers["p3"]["games"] == 2
    assert keepers["p3"]["saves"] == 2 and keepers["p3"]["conceded"] == 2
    assert keepers["p4"]["games"] == 1
    # Field players first, then goalkeepers, each by number.
    assert [p["playerId"] for p in s["players"]] == ["p2", "p1", "p3", "p4"]


def test_season_endpoint(client, auth, roster, match):
    mid = match["id"]
    client.post(f"/api/matches/{mid}/ops", headers=auth, json={"ops": [
        {"opId": "a", "kind": "add_event", "event": {
            "eventId": "e1", "type": "TOR", "half": 1, "clockSeconds": 5,
            "playerId": roster["max"]["id"]}},
    ]})
    # Not finished yet → not part of the season stats.
    res = client.get("/api/stats/season?season=2026/27", headers=auth)
    assert res.get_json()["summary"]["games"] == 0
    client.post(f"/api/matches/{mid}/finish", headers=auth)
    res = client.get("/api/stats/season?season=2026/27", headers=auth)
    summary = res.get_json()["summary"]
    assert summary["games"] == 1 and summary["score"]["own"] == 1
    assert summary["matches"][0]["id"] == mid
    assert client.get("/api/stats/seasons", headers=auth).get_json()["seasons"] == ["2026/27"]
    assert client.get("/api/stats/season", headers=auth).status_code == 400
