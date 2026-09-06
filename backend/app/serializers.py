from datetime import UTC, datetime
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId


def to_json(value: Any) -> Any:
    """Recursively convert Mongo documents into JSON-serialisable values."""
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        dt = value if value.tzinfo else value.replace(tzinfo=UTC)
        return dt.astimezone(UTC).isoformat().replace("+00:00", "Z")
    if isinstance(value, dict):
        out = {}
        for k, v in value.items():
            out["id" if k == "_id" else k] = to_json(v)
        return out
    if isinstance(value, list):
        return [to_json(v) for v in value]
    return value


def parse_object_id(value: str) -> ObjectId | None:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        return None


def parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    if not isinstance(value, str) or not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def utcnow() -> datetime:
    return datetime.now(UTC)


def season_for(kickoff: datetime) -> str:
    """Handball seasons run from summer to summer: Sep 2026 -> '2026/27', Mar 2027 -> '2026/27'."""
    y = kickoff.year
    if kickoff.month >= 7:
        return f"{y}/{(y + 1) % 100:02d}"
    return f"{y - 1}/{y % 100:02d}"
