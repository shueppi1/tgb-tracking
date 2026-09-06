from flask import Blueprint, Response, current_app

from ..auth import protect
from ..csv_export import base_filename, events_csv, export_zip, goalkeepers_csv, players_csv
from .matches import load_match

bp = protect(Blueprint("exports", __name__))


def _csv_response(content: str, filename: str) -> Response:
    return Response(
        content,
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@bp.get("/matches/<mid>/export/events.csv")
def export_events(mid):
    match = load_match(mid)
    catalog = current_app.extensions["catalog"]
    return _csv_response(events_csv(match, catalog), f"{base_filename(match)}_ereignisse.csv")


@bp.get("/matches/<mid>/export/players.csv")
def export_players(mid):
    match = load_match(mid)
    catalog = current_app.extensions["catalog"]
    return _csv_response(players_csv(match, catalog), f"{base_filename(match)}_spieler.csv")


@bp.get("/matches/<mid>/export/goalkeepers.csv")
def export_goalkeepers(mid):
    match = load_match(mid)
    catalog = current_app.extensions["catalog"]
    return _csv_response(goalkeepers_csv(match, catalog), f"{base_filename(match)}_torhueter.csv")


@bp.get("/matches/<mid>/export.zip")
def export_all(mid):
    match = load_match(mid)
    catalog = current_app.extensions["catalog"]
    return Response(
        export_zip(match, catalog),
        mimetype="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{base_filename(match)}.zip"'},
    )
