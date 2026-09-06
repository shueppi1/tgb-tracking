"""Match clock model. Mirrored 1:1 in frontend/src/domain/clock.ts.

The clock is a monotonic accumulator: `baseSeconds` holds the time accumulated while
stopped, `startedAt` the wall-clock instant it was last started. Half 1 starts at 0,
half 2 at 1800 (30:00). The clock is allowed to run past 30:00 / 60:00 — a half only
ends when the tracker says so.

All timestamps come from the *client* (the device tracking the match), so the client's
clock is authoritative and replaying an op later yields the same result.
"""

from datetime import UTC, datetime

HALF_LENGTH = 30 * 60
ACTIONS = ("start", "stop", "end_half", "correct")


def as_utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def new_clock() -> dict:
    return {"half": 1, "running": False, "baseSeconds": 0, "startedAt": None}


def elapsed_seconds(clock: dict, now: datetime) -> int:
    base = clock["baseSeconds"]
    if clock["running"] and clock.get("startedAt"):
        base += (as_utc(now) - as_utc(clock["startedAt"])).total_seconds()
    return max(0, int(base))


def start(clock: dict, now: datetime) -> dict:
    if clock["running"]:
        return clock
    return {**clock, "running": True, "startedAt": as_utc(now)}


def stop(clock: dict, now: datetime) -> dict:
    if not clock["running"]:
        return clock
    return {
        **clock,
        "running": False,
        "baseSeconds": elapsed_seconds(clock, now),
        "startedAt": None,
    }


def end_half(clock: dict, now: datetime) -> dict:
    if clock["half"] != 1:
        return clock
    return {"half": 2, "running": False, "baseSeconds": HALF_LENGTH, "startedAt": None}


def correct(clock: dict, now: datetime, seconds: int, half: int | None = None) -> dict:
    seconds = max(0, int(seconds))
    out = {**clock, "baseSeconds": seconds}
    if half in (1, 2):
        out["half"] = half
    out["startedAt"] = as_utc(now) if clock["running"] else None
    return out


def apply(clock: dict, action: str, now: datetime, seconds: int | None = None,
          half: int | None = None) -> dict:
    if action == "start":
        return start(clock, now)
    if action == "stop":
        return stop(clock, now)
    if action == "end_half":
        return end_half(clock, now)
    if action == "correct":
        if seconds is None:
            raise ValueError("correct requires seconds")
        return correct(clock, now, seconds, half)
    raise ValueError(f"unknown clock action {action!r}")
