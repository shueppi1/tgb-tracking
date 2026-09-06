"""Aggregation of match events into per-player, per-goalkeeper and team counts.

Kept as plain Python (not Mongo aggregation pipelines) so it is unit-testable, works with
mongomock, and can be reused by the summary endpoint, the CSV export and season stats.
Mirrored in frontend/src/domain/stats.ts for the live (offline) summary.
"""

from collections import defaultdict

from .events_catalog import event_ids

SAVE_IDS = ("GEHALTEN_6M", "GEHALTEN_7M", "GEHALTEN_9M")
CONCEDED_IDS = ("GGTOR_6M", "GGTOR_7M", "GGTOR_9M")


def player_event_ids(catalog: dict) -> list[str]:
    return event_ids(catalog, targets=("any", "field"))


def keeper_event_ids(catalog: dict) -> list[str]:
    return event_ids(catalog, targets=("goalkeeper",))


def team_event_ids(catalog: dict) -> list[str]:
    return event_ids(catalog, targets=("none",))


def count_matrix(events: list[dict]) -> dict[str | None, dict[str, int]]:
    """{playerId | None: {eventType: count}} — None holds the team (no-player) events."""
    matrix: dict[str | None, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for ev in events:
        pid = ev.get("playerId")
        matrix[str(pid) if pid is not None else None][ev["type"]] += 1
    return matrix


def _zero_counts(ids: list[str], counts: dict[str, int]) -> dict[str, int]:
    return {i: counts.get(i, 0) for i in ids}


def keeper_totals(counts: dict[str, int]) -> dict:
    saves = sum(counts.get(i, 0) for i in SAVE_IDS)
    conceded = sum(counts.get(i, 0) for i in CONCEDED_IDS)
    total = saves + conceded
    pct = round(saves * 100 / total, 1) if total else None
    return {"saves": saves, "conceded": conceded, "shots": total, "savePct": pct}


def score(matrix: dict) -> dict:
    own = sum(c.get("TOR", 0) for c in matrix.values())
    opp = sum(c.get(i, 0) for c in matrix.values() for i in CONCEDED_IDS)
    return {"own": own, "opponent": opp}


def match_summary(match: dict, catalog: dict) -> dict:
    """Summary for one match: all roster members with player-event counts, goalkeepers
    additionally with keeper counts, plus team events and the derived score."""
    matrix = count_matrix(match.get("events", []))
    p_ids = player_event_ids(catalog)
    k_ids = keeper_event_ids(catalog)
    t_ids = team_event_ids(catalog)

    players = []
    goalkeepers = []
    for member in match.get("roster", []):
        pid = str(member["playerId"])
        counts = matrix.get(pid, {})
        base = {
            "playerId": pid,
            "displayName": member["displayName"],
            "number": member["number"],
            "position": member["position"],
        }
        players.append({**base, "counts": _zero_counts(p_ids, counts)})
        if member["position"] == "goalkeeper":
            goalkeepers.append(
                {**base, "counts": _zero_counts(k_ids, counts), **keeper_totals(counts)}
            )

    return {
        "score": score(matrix),
        "team": _zero_counts(t_ids, matrix.get(None, {})),
        "players": players,
        "goalkeepers": goalkeepers,
        "eventCount": len(match.get("events", [])),
    }


def season_summary(matches: list[dict], catalog: dict) -> dict:
    """Totals across matches. Players are keyed by playerId; name/number are taken from the
    most recent roster snapshot so a renumbered player still aggregates into one row."""
    p_ids = player_event_ids(catalog)
    k_ids = keeper_event_ids(catalog)
    t_ids = team_event_ids(catalog)

    players: dict[str, dict] = {}
    keepers: dict[str, dict] = {}
    team = defaultdict(int)
    total_score = {"own": 0, "opponent": 0}
    wins = draws = losses = 0

    for match in sorted(matches, key=lambda m: m.get("kickoff") or 0):
        matrix = count_matrix(match.get("events", []))
        s = score(matrix)
        total_score["own"] += s["own"]
        total_score["opponent"] += s["opponent"]
        if s["own"] > s["opponent"]:
            wins += 1
        elif s["own"] < s["opponent"]:
            losses += 1
        else:
            draws += 1
        for k, v in matrix.get(None, {}).items():
            team[k] += v
        for member in match.get("roster", []):
            pid = str(member["playerId"])
            counts = matrix.get(pid, {})
            row = players.setdefault(
                pid, {"playerId": pid, "games": 0, "counts": defaultdict(int)}
            )
            row.update(
                displayName=member["displayName"],
                number=member["number"],
                position=member["position"],
            )
            row["games"] += 1
            for i in p_ids:
                row["counts"][i] += counts.get(i, 0)
            if member["position"] == "goalkeeper":
                krow = keepers.setdefault(
                    pid, {"playerId": pid, "games": 0, "counts": defaultdict(int)}
                )
                krow.update(
                    displayName=member["displayName"],
                    number=member["number"],
                    position=member["position"],
                )
                krow["games"] += 1
                for i in k_ids:
                    krow["counts"][i] += counts.get(i, 0)

    def finish_rows(rows: dict, ids: list[str], keeper: bool) -> list[dict]:
        out = []
        for row in rows.values():
            counts = _zero_counts(ids, row["counts"])
            item = {**row, "counts": counts}
            if keeper:
                item.update(keeper_totals(counts))
            out.append(item)
        out.sort(key=lambda r: (r["position"] != "field", r["number"]))
        return out

    return {
        "games": len(matches),
        "record": {"wins": wins, "draws": draws, "losses": losses},
        "score": total_score,
        "team": _zero_counts(t_ids, team),
        "players": finish_rows(players, p_ids, keeper=False),
        "goalkeepers": finish_rows(keepers, k_ids, keeper=True),
    }
