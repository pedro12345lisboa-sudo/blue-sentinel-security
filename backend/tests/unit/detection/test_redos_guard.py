"""ReDoS guard: static pattern screening + adversarial input timing."""

from __future__ import annotations

import time
from pathlib import Path

import pytest

from app.detection.sigma_loader import SigmaRuleSet, redos_risk
from app.detection.yara_scanner import YaraScanner
from tests.helpers import make_event


@pytest.mark.parametrize(
    "pattern",
    [
        "(a+)+",
        "(a*)*",
        r"(\d+)*",
        r"^(\w+\s?)*$",
        "x" * 600,  # length cap
    ],
)
def test_dangerous_patterns_are_flagged(pattern: str) -> None:
    assert redos_risk(pattern) is not None


@pytest.mark.parametrize(
    "pattern",
    [
        r"'1'='1|union(%20| )select|waitfor(%20| )delay",
        "\\temp\\",
        r"^WS-\d+$",
    ],
)
def test_reasonable_patterns_are_allowed(pattern: str) -> None:
    assert redos_risk(pattern) is None


def test_adversarial_event_evaluates_instantly(rules_root: Path) -> None:
    """A worst-case crafted event must not stall rule evaluation."""
    evil = "a" * 8000
    event = make_event(
        "2024-06-18T13:10:00Z",
        category="web",
        action="http_request",
        product="generic",
        host=evil,
        user=evil,
        url=f"/p?id=1'{evil}",
        path="/p",
        command_line=evil,
        message=evil,
        port=4444,
        destination_ip="198.51.100.66",
    )
    # Same shape repeated for every event field the rules touch.
    sigma = SigmaRuleSet(rules_root / "sigma")
    yara = YaraScanner(rules_root / "yara")

    started = time.perf_counter()
    for _ in range(20):
        for rule in sigma.rules.values():
            rule.match(event)
        yara.scan(event.get("text", ""))
    elapsed_ms = (time.perf_counter() - started) * 1000
    # 20 full passes over all rules; budget leaves headroom on slow CI.
    assert elapsed_ms < 500, f"20 passes took {elapsed_ms:.0f} ms"
