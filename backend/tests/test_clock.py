from datetime import UTC, datetime, timedelta

from app import clock

T0 = datetime(2026, 9, 6, 17, 0, tzinfo=UTC)


def at(seconds: int) -> datetime:
    return T0 + timedelta(seconds=seconds)


def test_new_clock_is_stopped_at_zero():
    c = clock.new_clock()
    assert c == {"half": 1, "running": False, "baseSeconds": 0, "startedAt": None}
    assert clock.elapsed_seconds(c, at(100)) == 0


def test_start_stop_accumulates():
    c = clock.start(clock.new_clock(), at(0))
    assert clock.elapsed_seconds(c, at(90)) == 90
    c = clock.stop(c, at(90))
    assert c["running"] is False and c["baseSeconds"] == 90
    assert clock.elapsed_seconds(c, at(500)) == 90  # frozen
    c = clock.start(c, at(500))
    assert clock.elapsed_seconds(c, at(560)) == 150


def test_start_when_running_and_stop_when_stopped_are_noops():
    c = clock.start(clock.new_clock(), at(0))
    assert clock.start(c, at(50)) == c
    s = clock.stop(c, at(50))
    assert clock.stop(s, at(80)) == s


def test_end_half_jumps_to_30_minutes_and_stops():
    c = clock.start(clock.new_clock(), at(0))
    c = clock.end_half(c, at(1900))
    assert c == {"half": 2, "running": False, "baseSeconds": 1800, "startedAt": None}
    assert clock.elapsed_seconds(c, at(5000)) == 1800
    assert clock.end_half(c, at(6000)) == c  # already in half 2


def test_clock_may_run_past_half_length():
    c = clock.start(clock.new_clock(), at(0))
    assert clock.elapsed_seconds(c, at(1900)) == 1900


def test_correct_while_running_keeps_running():
    c = clock.start(clock.new_clock(), at(0))
    c = clock.correct(c, at(100), 60)
    assert c["running"] is True and c["baseSeconds"] == 60
    assert clock.elapsed_seconds(c, at(130)) == 90


def test_correct_while_stopped_and_half_change():
    c = clock.correct(clock.new_clock(), at(0), 1850, half=2)
    assert c == {"half": 2, "running": False, "baseSeconds": 1850, "startedAt": None}


def test_apply_dispatch():
    c = clock.apply(clock.new_clock(), "start", at(0))
    c = clock.apply(c, "stop", at(10))
    c = clock.apply(c, "correct", at(10), seconds=42)
    c = clock.apply(c, "end_half", at(10))
    assert c["half"] == 2 and c["baseSeconds"] == 1800
