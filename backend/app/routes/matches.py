from flask import Blueprint, current_app, jsonify, request
from pymongo import ReturnDocument

from .. import clock as clock_model
from ..auth import protect
from ..db import get_db
from ..errors import Conflict, NotFound, ValidationError
from ..events_catalog import allowed_positions
from ..serializers import parse_datetime, parse_object_id, season_for, to_json, utcnow
from ..stats import match_summary, score

bp = protect(Blueprint("matches", __name__))

MAX_OPS_PER_REQUEST = 200
MAX_EVENT_ID = 64
HOME_AWAY = ("home", "away")
STATUSES = ("running", "finished")


def _catalog() -> dict:
    return current_app.extensions["catalog"]


def load_match(mid: str) -> dict:
    oid = parse_object_id(mid)
    doc = get_db().matches.find_one({"_id": oid}) if oid else None
    if not doc:
        raise NotFound("Spiel nicht gefunden.")
    return doc


def _listing(doc: dict) -> dict:
    events = doc.get("events", [])
    matrix = {}
    for ev in events:
        pid = str(ev["playerId"]) if ev.get("playerId") is not None else None
        matrix.setdefault(pid, {}).setdefault(ev["type"], 0)
        matrix[pid][ev["type"]] += 1
    out = {k: v for k, v in doc.items() if k not in ("events", "appliedOpIds")}
    out["eventCount"] = len(events)
    out["score"] = score(matrix)
    return to_json(out)


def _public(doc: dict) -> dict:
    out = {k: v for k, v in doc.items() if k != "appliedOpIds"}
    return to_json(out)


@bp.get("/matches")
def list_matches():
    query = {}
    status = request.args.get("status")
    if status:
        if status not in STATUSES:
            raise ValidationError("Ungültiger Status.")
        query["status"] = status
    season = request.args.get("season")
    if season:
        query["season"] = season
    docs = list(get_db().matches.find(query))
    docs.sort(key=lambda d: d.get("kickoff") or utcnow(), reverse=True)
    return jsonify(matches=[_listing(d) for d in docs])


@bp.post("/matches")
def create_match():
    db = get_db()
    data = request.get_json(silent=True) or {}

    opponent = data.get("opponent")
    if not isinstance(opponent, str) or not opponent.strip():
        raise ValidationError("Gegner fehlt.")
    kickoff = parse_datetime(data.get("kickoff"))
    if kickoff is None:
        raise ValidationError("Datum/Uhrzeit fehlt oder ist ungültig.")
    home_away = data.get("homeAway", "home")
    if home_away not in HOME_AWAY:
        raise ValidationError("homeAway muss 'home' oder 'away' sein.")
    season = data.get("season") or season_for(kickoff)
    if not isinstance(season, str) or len(season) > 20:
        raise ValidationError("Saison ist ungültig.")

    player_ids = data.get("playerIds")
    if not isinstance(player_ids, list) or not player_ids:
        raise ValidationError("Es müssen Spieler ausgewählt werden.")
    oids = []
    for pid in player_ids:
        oid = parse_object_id(pid) if isinstance(pid, str) else None
        if oid is None:
            raise ValidationError(f"Ungültige Spieler-ID: {pid!r}")
        oids.append(oid)
    if len(set(oids)) != len(oids):
        raise ValidationError("Spieler doppelt ausgewählt.")

    players = list(db.players.find({"_id": {"$in": oids}, "active": True}))
    if len(players) != len(oids):
        raise ValidationError(
            "Mindestens ein ausgewählter Spieler existiert nicht oder ist inaktiv."
        )
    roster = [
        {
            "playerId": p["_id"],
            "displayName": p["displayName"],
            "number": p["number"],
            "position": p["position"],
        }
        for p in players
    ]
    roster.sort(key=lambda r: (r["position"] != "field", r["number"]))
    if not any(r["position"] == "goalkeeper" for r in roster):
        raise ValidationError("Es muss mindestens ein Torwart ausgewählt sein.")
    if not any(r["position"] == "field" for r in roster):
        raise ValidationError("Es muss mindestens ein Feldspieler ausgewählt sein.")

    now = utcnow()
    match = {
        "opponent": opponent.strip(),
        "kickoff": kickoff,
        "season": season,
        "homeAway": home_away,
        "status": "running",
        "roster": roster,
        "clock": clock_model.new_clock(),
        "events": [],
        "appliedOpIds": [],
        "createdAt": now,
        "updatedAt": now,
        "finishedAt": None,
    }
    result = db.matches.insert_one(match)
    match["_id"] = result.inserted_id
    return jsonify(match=_public(match)), 201


@bp.get("/matches/<mid>")
def get_match(mid):
    return jsonify(match=_public(load_match(mid)))


@bp.patch("/matches/<mid>")
def update_match(mid):
    match = load_match(mid)
    data = request.get_json(silent=True) or {}
    updates = {}
    if "opponent" in data:
        if not isinstance(data["opponent"], str) or not data["opponent"].strip():
            raise ValidationError("Gegner darf nicht leer sein.")
        updates["opponent"] = data["opponent"].strip()
    if "kickoff" in data:
        kickoff = parse_datetime(data["kickoff"])
        if kickoff is None:
            raise ValidationError("Datum/Uhrzeit ist ungültig.")
        updates["kickoff"] = kickoff
    if "homeAway" in data:
        if data["homeAway"] not in HOME_AWAY:
            raise ValidationError("homeAway muss 'home' oder 'away' sein.")
        updates["homeAway"] = data["homeAway"]
    if "season" in data:
        if not isinstance(data["season"], str) or not data["season"].strip():
            raise ValidationError("Saison darf nicht leer sein.")
        updates["season"] = data["season"].strip()
    if not updates:
        raise ValidationError("Keine Änderungen übergeben.")
    updates["updatedAt"] = utcnow()
    doc = get_db().matches.find_one_and_update(
        {"_id": match["_id"]}, {"$set": updates}, return_document=ReturnDocument.AFTER
    )
    return jsonify(match=_public(doc))


@bp.delete("/matches/<mid>")
def delete_match(mid):
    match = load_match(mid)
    get_db().matches.delete_one({"_id": match["_id"]})
    return jsonify(ok=True)


# --- ops ---------------------------------------------------------------------------


def validate_event(ev: dict, match: dict, catalog: dict) -> dict:
    if not isinstance(ev, dict):
        raise ValidationError("Ereignis fehlt.")
    event_id = ev.get("eventId")
    if not isinstance(event_id, str) or not 1 <= len(event_id) <= MAX_EVENT_ID:
        raise ValidationError("eventId fehlt oder ist ungültig.")
    ev_type = ev.get("type")
    definition = catalog["byId"].get(ev_type)
    if definition is None:
        raise ValidationError(f"Unbekannter Ereignistyp: {ev_type!r}")
    half = ev.get("half")
    if half not in (1, 2):
        raise ValidationError("Halbzeit muss 1 oder 2 sein.")
    seconds = ev.get("clockSeconds")
    if isinstance(seconds, bool) or not isinstance(seconds, int | float) or seconds < 0:
        raise ValidationError("clockSeconds fehlt oder ist ungültig.")

    positions = allowed_positions(definition["target"])
    raw_pid = ev.get("playerId")
    player_oid = None
    if not positions:
        if raw_pid is not None:
            raise ValidationError(f"'{definition['label']}' wird ohne Spieler erfasst.")
    else:
        player_oid = parse_object_id(raw_pid) if isinstance(raw_pid, str) else None
        member = next((m for m in match["roster"] if m["playerId"] == player_oid), None)
        if member is None:
            raise ValidationError(f"'{definition['label']}' benötigt einen Spieler aus dem Kader.")
        if member["position"] not in positions:
            raise ValidationError(
                f"'{definition['label']}' ist für {member['displayName']} nicht erlaubt."
            )

    recorded_at = parse_datetime(ev.get("recordedAt")) or utcnow()
    return {
        "eventId": event_id,
        "type": ev_type,
        "half": half,
        "clockSeconds": int(seconds),
        "playerId": player_oid,
        "recordedAt": recorded_at,
    }


def _apply_op(db, match: dict, op: dict, catalog: dict) -> dict:
    kind = op.get("kind")
    op_id = op["opId"]
    now = utcnow()
    filt = {"_id": match["_id"]}
    mark = {"$addToSet": {"appliedOpIds": op_id}, "$set": {"updatedAt": now}}

    if kind == "add_event":
        event = validate_event(op.get("event"), match, catalog)
        doc = db.matches.find_one_and_update(
            {**filt, "events.eventId": {"$ne": event["eventId"]}},
            {"$push": {"events": event}, **mark},
            return_document=ReturnDocument.AFTER,
        )
        if doc is None:  # event already present → replay; only mark the op
            doc = db.matches.find_one_and_update(filt, mark, return_document=ReturnDocument.AFTER)
        return doc

    if kind == "delete_event":
        event_id = op.get("eventId")
        if not isinstance(event_id, str) or not event_id:
            raise ValidationError("eventId fehlt.")
        return db.matches.find_one_and_update(
            filt, {"$pull": {"events": {"eventId": event_id}}, **mark},
            return_document=ReturnDocument.AFTER,
        )

    if kind == "clock":
        action = op.get("action")
        if action not in clock_model.ACTIONS:
            raise ValidationError(f"Unbekannte Uhr-Aktion: {action!r}")
        at = parse_datetime(op.get("at")) or now
        seconds = op.get("seconds")
        if action == "correct":
            if isinstance(seconds, bool) or not isinstance(seconds, int | float) or seconds < 0:
                raise ValidationError("Sekunden fehlen oder sind ungültig.")
        half = op.get("half")
        if half is not None and half not in (1, 2):
            raise ValidationError("Halbzeit muss 1 oder 2 sein.")
        try:
            new_clock = clock_model.apply(match["clock"], action, at, seconds, half)
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc
        mark["$set"]["clock"] = new_clock
        return db.matches.find_one_and_update(filt, mark, return_document=ReturnDocument.AFTER)

    raise ValidationError(f"Unbekannte Operation: {kind!r}")


@bp.post("/matches/<mid>/ops")
def apply_ops(mid):
    """Apply a batch of client operations idempotently. Each op carries a client-generated
    opId; ops already applied are acknowledged without re-applying, so a retried batch
    after a lost response never duplicates events or double-counts clock time."""
    db = get_db()
    catalog = _catalog()
    match = load_match(mid)
    if match["status"] != "running":
        raise Conflict("Das Spiel ist bereits beendet.")

    data = request.get_json(silent=True) or {}
    ops = data.get("ops")
    if not isinstance(ops, list):
        raise ValidationError("'ops' muss eine Liste sein.")
    if len(ops) > MAX_OPS_PER_REQUEST:
        raise ValidationError(f"Maximal {MAX_OPS_PER_REQUEST} Operationen pro Anfrage.")

    applied_ids = set(match.get("appliedOpIds", []))
    applied, rejected = [], []
    for op in ops:
        op_id = op.get("opId") if isinstance(op, dict) else None
        if not isinstance(op_id, str) or not 1 <= len(op_id) <= MAX_EVENT_ID:
            raise ValidationError("opId fehlt oder ist ungültig.")
        if op_id in applied_ids:
            applied.append(op_id)
            continue
        try:
            match = _apply_op(db, match, op, catalog)
        except ValidationError as exc:
            rejected.append({"opId": op_id, "error": str(exc)})
            continue
        applied_ids.add(op_id)
        applied.append(op_id)

    return jsonify(applied=applied, rejected=rejected, match=_public(match))


@bp.post("/matches/<mid>/finish")
def finish_match(mid):
    match = load_match(mid)
    now = utcnow()
    updates = {"status": "finished", "finishedAt": now, "updatedAt": now}
    if match["clock"]["running"]:
        updates["clock"] = clock_model.stop(match["clock"], now)
    doc = get_db().matches.find_one_and_update(
        {"_id": match["_id"]}, {"$set": updates}, return_document=ReturnDocument.AFTER
    )
    return jsonify(match=_public(doc))


@bp.post("/matches/<mid>/reopen")
def reopen_match(mid):
    match = load_match(mid)
    doc = get_db().matches.find_one_and_update(
        {"_id": match["_id"]},
        {"$set": {"status": "running", "finishedAt": None, "updatedAt": utcnow()}},
        return_document=ReturnDocument.AFTER,
    )
    return jsonify(match=_public(doc))


@bp.get("/matches/<mid>/summary")
def summary(mid):
    match = load_match(mid)
    return jsonify(summary=match_summary(match, _catalog()))
