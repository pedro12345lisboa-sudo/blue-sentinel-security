"""Correlation patterns: windows, ordering, grouping and stores."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.detection.correlation import (
    CorrelationEngine,
    MemoryWindowStore,
    PatternError,
    RedisWindowStore,
    load_pattern,
)
from tests.helpers import make_event

FAILED = {"bs-auth-failed-logons"}


def failed(ts: str, user: str = "jsilva", host: str = "WS-1"):
    event = make_event(ts, action="failed_logon", host=host, user=user)
    return event, set(FAILED)


def success(ts: str, user: str = "jsilva", host: str = "WS-1"):
    event = make_event(ts, action="logon", host=host, user=user)
    return event, set()


@pytest.fixture(scope="module")
def engine(rules_root: Path) -> CorrelationEngine:
    return CorrelationEngine.from_directory(rules_root / "patterns")


def test_two_patterns_loaded(engine: CorrelationEngine) -> None:
    assert set(engine.patterns) == {"corr-brute-force-sequence", "corr-sqli-burst"}


def test_brute_force_pattern_loads(engine: CorrelationEngine) -> None:
    pattern = engine.patterns["corr-brute-force-sequence"]
    assert pattern.window_seconds == 300
    assert pattern.group_by == ("host", "user")
    assert [stage.id for stage in pattern.stages] == ["failed_logons", "success"]
    assert pattern.stages[0].min_events == 5
    assert pattern.severity == "critical"
    assert pattern.mitre == ("T1110.001", "T1078")


def test_sequence_fires_after_success(engine: CorrelationEngine) -> None:
    fired = []
    for minute in range(5):
        event, matched = failed(f"2024-06-18T13:{10 + minute:02d}:00")
        fired += engine.feed(event, matched)
    assert fired == []
    event, matched = success("2024-06-18T13:15:00")
    fired += engine.feed(event, matched)
    assert len(fired) == 1
    alert = fired[0]
    assert alert["rule_id"] == "corr-brute-force-sequence"
    assert alert["severity"] == "critical"
    assert alert["group"] == {"host": "WS-1", "user": "jsilva"}
    assert alert["kind"] == "correlation"
    assert len(alert["stages"]) == 2
    assert alert["matched_fields"][0]["actual"] >= 5


def test_sequence_does_not_fire_without_enough_failures(engine: CorrelationEngine) -> None:
    for minute in range(3):
        event, matched = failed(f"2024-06-19T09:{10 + minute:02d}:00")
        engine.feed(event, matched)
    event, matched = success("2024-06-19T09:20:00")
    fired = engine.feed(event, matched)
    assert fired == []


def test_sequence_respects_window_on_the_simulated_clock(engine: CorrelationEngine) -> None:
    # 5 failures, then a success 10 minutes later (window is 300 s).
    for minute in range(5):
        event, matched = failed(f"2024-06-20T10:{minute:02d}:00", host="WS-2")
        engine.feed(event, matched)
    event, matched = success("2024-06-20T10:15:00", host="WS-2")
    fired = engine.feed(event, matched)
    # Stage 1 completed >300 s before the success -> no correlation alert.
    assert fired == []


def test_groups_are_isolated(engine: CorrelationEngine) -> None:
    # Five failures for user A and one success for user B must not correlate.
    for minute in range(5):
        event, matched = failed(f"2024-06-21T11:{minute:02d}:00", user="alice")
        engine.feed(event, matched)
    event, matched = success("2024-06-21T11:06:00", user="bob")
    assert engine.feed(event, matched) == []
    # The same success for user A does correlate.
    event, matched = success("2024-06-21T11:07:00", user="alice")
    fired = engine.feed(event, matched)
    assert len(fired) == 1
    assert fired[0]["group"]["user"] == "alice"


def test_state_resets_after_a_pattern_fires(engine: CorrelationEngine) -> None:
    for minute in range(5):
        event, matched = failed(f"2024-06-22T12:{minute:02d}:00", host="WS-3")
        engine.feed(event, matched)
    event, matched = success("2024-06-22T12:06:00", host="WS-3")
    assert len(engine.feed(event, matched)) == 1
    # A second success right after must not fire again (state was reset).
    event, matched = success("2024-06-22T12:07:00", host="WS-3")
    assert engine.feed(event, matched) == []


def test_sqli_burst_counts_rule_matches(engine: CorrelationEngine) -> None:
    def probe(ts: str, host: str = "WEB-1"):
        event = make_event(
            ts,
            category="web",
            action="http_request",
            host=host,
            user="-",
            product="generic",
            url="/products?id=1'%20OR%20'1'='1",
        )
        return event, {"bs-web-sql-injection", "Web_SQLi_Access_Log"}

    event, matched = probe("2024-07-03T09:15:20")
    assert engine.feed(event, matched) == []
    event, matched = probe("2024-07-03T09:15:35")
    assert engine.feed(event, matched) == []
    event, matched = probe("2024-07-03T09:15:50")
    fired = engine.feed(event, matched)
    assert len(fired) == 1
    assert fired[0]["rule_id"] == "corr-sqli-burst"
    assert fired[0]["window_seconds"] == 120
    # One match per event: three events from two different rule ids = 3.
    assert fired[0]["matched_fields"][0]["actual"] >= 3


def test_sqli_burst_is_per_host(engine: CorrelationEngine) -> None:
    def probe(ts: str, host: str):
        event = make_event(
            ts,
            category="web",
            action="http_request",
            host=host,
            user="-",
            product="generic",
            url="/q?x=1'%20OR%20'1'='1",
        )
        return event, {"bs-web-sql-injection"}

    for index in range(3):
        event, matched = probe(f"2024-07-04T08:0{index}:00", "WEB-A")
        engine.feed(event, matched)
        event, matched = probe(f"2024-07-04T08:0{index}:30", "WEB-B")
        engine.feed(event, matched)
    # Each host accumulated exactly 3 -> both fired once (collected below).
    event, matched = probe("2024-07-04T08:10:00", "WEB-A")
    assert engine.feed(event, matched) == []


def test_pattern_file_validation(tmp_path: Path) -> None:
    bad = tmp_path / "bad.yaml"
    bad.write_text(
        "id: x\ntitle: t\ndescription: d\nseverity: nope\nwindow_seconds: 60\n"
        "group_by: [host]\nstages: [{id: s, min_events: 1, source: {rule_ids: [r]}}]\n",
        encoding="utf-8",
    )
    with pytest.raises(PatternError):
        load_pattern(bad)

    bad.write_text(
        "id: x\ntitle: t\ndescription: d\ncritical\nwindow_seconds: 60\n"
        "group_by: [host]\nstages: [{id: s, min_events: 1, source: {rule_ids: [r]}}]\n",
        encoding="utf-8",
    )
    with pytest.raises(PatternError):
        load_pattern(bad)


class FakeRedis:
    """Minimal stand-in so RedisWindowStore can be tested without redis-py."""

    def __init__(self) -> None:
        self.data: dict[str, str] = {}

    def get(self, key: str):
        return self.data.get(key)

    def set(self, key: str, value: str, ex: int | None = None) -> None:
        self.data[key] = value

    def delete(self, key: str) -> None:
        self.data.pop(key, None)


def test_memory_store_roundtrip() -> None:
    store = MemoryWindowStore()
    store.set_entries("p", "g", "s", [["e1", 1.0], ["e2", 2.0]])
    assert store.entries("p", "g", "s") == [["e1", 1.0], ["e2", 2.0]]
    store.set_completions("p", "g", {"s": 2.0})
    assert store.completions("p", "g") == {"s": 2.0}
    store.reset("p", "g")
    assert store.entries("p", "g", "s") == []
    assert store.completions("p", "g") == {}


def test_redis_store_roundtrip() -> None:
    client = FakeRedis()
    store = RedisWindowStore(client)
    store.set_entries("p", "g", "s", [["e1", 1.0]])
    store.set_completions("p", "g", {"s": 1.0})
    assert store.entries("p", "g", "s") == [["e1", 1.0]]
    assert store.completions("p", "g") == {"s": 1.0}
    store.reset("p", "g")
    assert store.completions("p", "g") == {}
    assert client.data == {}


def test_correlation_works_against_redis_store(rules_root: Path) -> None:
    store = RedisWindowStore(FakeRedis())
    engine = CorrelationEngine.from_directory(rules_root / "patterns", store=store)
    for minute in range(5):
        event, matched = failed(f"2024-06-23T14:{minute:02d}:00", host="WS-R")
        assert engine.feed(event, matched) == []
    event, matched = success("2024-06-23T14:06:00", host="WS-R")
    fired = engine.feed(event, matched)
    assert len(fired) == 1
    assert fired[0]["group"]["host"] == "WS-R"
