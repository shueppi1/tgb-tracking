from flask import Blueprint, current_app, jsonify, request

from ..auth import protect
from ..db import get_db
from ..errors import ValidationError
from ..stats import season_summary

bp = protect(Blueprint("stats", __name__))


@bp.get("/stats/seasons")
def seasons():
    values = [s for s in get_db().matches.distinct("season") if isinstance(s, str)]
    values.sort(reverse=True)
    return jsonify(seasons=values)


@bp.get("/stats/season")
def season():
    name = request.args.get("season", "").strip()
    if not name:
        raise ValidationError("Parameter 'season' fehlt.")
    matches = list(get_db().matches.find({"season": name, "status": "finished"}))
    summary = season_summary(matches, current_app.extensions["catalog"])
    summary["season"] = name
    summary["matches"] = [
        {"id": str(m["_id"]), "opponent": m["opponent"], "kickoff": m["kickoff"].isoformat()}
        for m in sorted(matches, key=lambda m: m["kickoff"])
    ]
    return jsonify(summary=summary)
