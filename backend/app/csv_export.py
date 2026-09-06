"""CSV export. Files use ';' as delimiter and start with a UTF-8 BOM so that a
German-locale Excel opens them correctly without the import wizard."""

import csv
import io
import re
import zipfile
from datetime import UTC, datetime

from .stats import match_summary

BOM = "\ufeff"
DELIMITER = ";"

POSITION_LABEL = {"field": "Spieler", "goalkeeper": "Torwart"}


def format_clock(seconds: int) -> str:
    seconds = max(0, int(seconds))
    return f"{seconds // 60:02d}:{seconds % 60:02d}"


def _writer():
    buf = io.StringIO()
    buf.write(BOM)
    return buf, csv.writer(buf, delimiter=DELIMITER, lineterminator="\r\n")


def _fmt_dt(dt: datetime | None) -> str:
    if not dt:
        return ""
    dt = dt if dt.tzinfo else dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).strftime("%Y-%m-%d %H:%M:%S")


def slugify(text: str) -> str:
    text = (
        text.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
        .replace("Ä", "Ae").replace("Ö", "Oe").replace("Ü", "Ue")
    )
    text = re.sub(r"[^A-Za-z0-9]+", "-", text).strip("-")
    return text or "spiel"


def base_filename(match: dict) -> str:
    kickoff = match.get("kickoff")
    date = kickoff.strftime("%Y-%m-%d") if isinstance(kickoff, datetime) else "spiel"
    return f"{date}_{slugify(match.get('opponent', ''))}"


def events_csv(match: dict, catalog: dict) -> str:
    roster = {str(m["playerId"]): m for m in match.get("roster", [])}
    buf, w = _writer()
    w.writerow(["Nr", "Halbzeit", "Spielzeit", "Ereignis", "Nummer", "Anzeigename", "Position",
                "Uhrzeit (UTC)"])
    events = sorted(match.get("events", []), key=lambda e: (e["half"], e["clockSeconds"],
                                                            e.get("recordedAt") or datetime.min))
    for i, ev in enumerate(events, start=1):
        member = roster.get(str(ev.get("playerId"))) if ev.get("playerId") else None
        w.writerow([
            i,
            ev["half"],
            format_clock(ev["clockSeconds"]),
            catalog["byId"].get(ev["type"], {}).get("label", ev["type"]),
            member["number"] if member else "",
            member["displayName"] if member else "",
            POSITION_LABEL.get(member["position"], "") if member else "",
            _fmt_dt(ev.get("recordedAt")),
        ])
    return buf.getvalue()


def players_csv(match: dict, catalog: dict) -> str:
    summary = match_summary(match, catalog)
    ids = list(summary["players"][0]["counts"].keys()) if summary["players"] else []
    labels = [catalog["byId"][i]["label"] for i in ids]
    buf, w = _writer()
    w.writerow(["Nummer", "Anzeigename", "Position", *labels])
    for row in summary["players"]:
        w.writerow([row["number"], row["displayName"], POSITION_LABEL[row["position"]],
                    *[row["counts"][i] for i in ids]])
    return buf.getvalue()


def goalkeepers_csv(match: dict, catalog: dict) -> str:
    summary = match_summary(match, catalog)
    ids = list(summary["goalkeepers"][0]["counts"].keys()) if summary["goalkeepers"] else []
    labels = [catalog["byId"][i]["label"] for i in ids]
    buf, w = _writer()
    w.writerow(["Nummer", "Anzeigename", *labels, "Gehalten gesamt", "Gegentore gesamt",
                "Würfe", "Quote %"])
    for row in summary["goalkeepers"]:
        pct = "" if row["savePct"] is None else str(row["savePct"]).replace(".", ",")
        w.writerow([row["number"], row["displayName"], *[row["counts"][i] for i in ids],
                    row["saves"], row["conceded"], row["shots"], pct])
    return buf.getvalue()


def export_zip(match: dict, catalog: dict) -> bytes:
    base = base_filename(match)
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{base}_ereignisse.csv", events_csv(match, catalog))
        zf.writestr(f"{base}_spieler.csv", players_csv(match, catalog))
        zf.writestr(f"{base}_torhueter.csv", goalkeepers_csv(match, catalog))
    return out.getvalue()
