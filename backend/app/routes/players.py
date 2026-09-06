from flask import Blueprint, jsonify, request

from ..auth import protect
from ..db import get_db
from ..errors import NotFound, ValidationError
from ..events_catalog import POSITIONS
from ..serializers import parse_object_id, to_json, utcnow

bp = protect(Blueprint("players", __name__))

MAX_NAME = 60


def _clean_str(data: dict, key: str, *, required: bool) -> str | None:
    value = data.get(key)
    if value is None:
        if required:
            raise ValidationError(f"Feld '{key}' fehlt.")
        return None
    if not isinstance(value, str) or not value.strip():
        raise ValidationError(f"Feld '{key}' darf nicht leer sein.")
    value = value.strip()
    if len(value) > MAX_NAME:
        raise ValidationError(f"Feld '{key}' ist zu lang (max. {MAX_NAME} Zeichen).")
    return value


def _clean_number(data: dict, *, required: bool) -> int | None:
    value = data.get("number")
    if value is None:
        if required:
            raise ValidationError("Rückennummer fehlt.")
        return None
    if isinstance(value, bool) or not isinstance(value, int | str):
        raise ValidationError("Rückennummer muss eine Zahl sein.")
    try:
        number = int(value)
    except ValueError as exc:
        raise ValidationError("Rückennummer muss eine Zahl sein.") from exc
    if not 0 <= number <= 99:
        raise ValidationError("Rückennummer muss zwischen 0 und 99 liegen.")
    return number


def _clean_position(data: dict, *, required: bool) -> str | None:
    value = data.get("position")
    if value is None:
        if required:
            raise ValidationError("Position fehlt.")
        return None
    if value not in POSITIONS:
        raise ValidationError("Position muss 'field' oder 'goalkeeper' sein.")
    return value


def _assert_number_free(db, number: int, exclude_id=None) -> None:
    query = {"number": number, "active": True}
    if exclude_id is not None:
        query["_id"] = {"$ne": exclude_id}
    if db.players.find_one(query):
        raise ValidationError(f"Rückennummer {number} ist bereits vergeben.")


@bp.get("/players")
def list_players():
    db = get_db()
    query = {}
    active = request.args.get("active")
    if active in ("true", "1"):
        query["active"] = True
    elif active in ("false", "0"):
        query["active"] = False
    docs = list(db.players.find(query))
    docs.sort(key=lambda d: (d["position"] != "field", d["number"], d["displayName"]))
    return jsonify(players=to_json(docs))


@bp.post("/players")
def create_player():
    db = get_db()
    data = request.get_json(silent=True) or {}
    player = {
        "firstName": _clean_str(data, "firstName", required=True),
        "lastName": _clean_str(data, "lastName", required=True),
        "displayName": _clean_str(data, "displayName", required=True),
        "number": _clean_number(data, required=True),
        "position": _clean_position(data, required=True),
        "active": True,
    }
    _assert_number_free(db, player["number"])
    now = utcnow()
    player["createdAt"] = now
    player["updatedAt"] = now
    result = db.players.insert_one(player)
    player["_id"] = result.inserted_id
    return jsonify(player=to_json(player)), 201


@bp.patch("/players/<pid>")
def update_player(pid):
    db = get_db()
    oid = parse_object_id(pid)
    existing = db.players.find_one({"_id": oid}) if oid else None
    if not existing:
        raise NotFound("Spieler nicht gefunden.")
    data = request.get_json(silent=True) or {}
    updates = {}
    for key in ("firstName", "lastName", "displayName"):
        value = _clean_str(data, key, required=False)
        if value is not None:
            updates[key] = value
    number = _clean_number(data, required=False)
    if number is not None:
        updates["number"] = number
    position = _clean_position(data, required=False)
    if position is not None:
        updates["position"] = position
    if "active" in data:
        if not isinstance(data["active"], bool):
            raise ValidationError("Feld 'active' muss true oder false sein.")
        updates["active"] = data["active"]
    if not updates:
        raise ValidationError("Keine Änderungen übergeben.")

    will_be_active = updates.get("active", existing["active"])
    new_number = updates.get("number", existing["number"])
    if will_be_active:
        _assert_number_free(db, new_number, exclude_id=oid)

    updates["updatedAt"] = utcnow()
    db.players.update_one({"_id": oid}, {"$set": updates})
    return jsonify(player=to_json(db.players.find_one({"_id": oid})))
