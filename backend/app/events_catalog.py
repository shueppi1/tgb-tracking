"""Loads the shared event catalog (shared/events.json) — the single source of truth
for event ids, labels, targets and groups, shared with the frontend."""

import json
from functools import lru_cache
from pathlib import Path

TARGETS = ("none", "any", "field", "goalkeeper")
POSITIONS = ("field", "goalkeeper")

_DEFAULT_PATH = Path(__file__).resolve().parents[2] / "shared" / "events.json"


@lru_cache(maxsize=4)
def load_catalog(path: str | None = None) -> dict:
    p = Path(path) if path else _DEFAULT_PATH
    with p.open(encoding="utf-8") as fh:
        catalog = json.load(fh)
    ids = [e["id"] for e in catalog["events"]]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate event ids in catalog")
    for e in catalog["events"]:
        if e["target"] not in TARGETS:
            raise ValueError(f"unknown target {e['target']!r} for {e['id']}")
    catalog["byId"] = {e["id"]: e for e in catalog["events"]}
    return catalog


def event_ids(catalog: dict, *, targets: tuple[str, ...]) -> list[str]:
    return [e["id"] for e in catalog["events"] if e["target"] in targets]


def allowed_positions(target: str) -> tuple[str, ...]:
    if target == "none":
        return ()
    if target == "any":
        return POSITIONS
    return (target,)
