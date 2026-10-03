"""Fixture-driven acceptance for the published rule library.

Every rule ships a positive fixture (it must fire, alone or together with
the rules declared in ``expect``) and a negative fixture (no rule at all
may fire). The fixtures are raw synthetic records - the same shape the
scenario generator emits - so they exercise normalisation, Sigma matching
and YARA scanning together.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from app.collectors.normalizer import normalize
from app.detection.sigma_loader import SigmaRuleSet
from app.detection.yara_scanner import YaraScanner

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "detection"

# The library contract from the brief: 20 Sigma rules + 5 YARA rules.
SIGMA_RULE_IDS = {
    "bs-auth-failed-logons",
    "bs-auth-rdp-external-logon",
    "bs-win-member-added-local-admin",
    "bs-win-service-installed",
    "bs-win-scheduled-task-created",
    "bs-win-office-spawned-shell",
    "bs-win-run-key-modified",
    "bs-audit-log-cleared",
    "bs-proc-powershell-encoded-command",
    "bs-proc-temp-folder-execution",
    "bs-net-suspicious-outbound",
    "bs-linux-ssh-failed-logons",
    "bs-linux-user-created-uid-zero",
    "bs-linux-crontab-modified",
    "bs-linux-sudo-unusual-account",
    "bs-web-sql-injection",
    "bs-web-path-traversal",
    "bs-web-scanner-user-agent",
    "bs-cloud-login-new-country",
    "bs-cloud-access-key-created",
}
YARA_RULE_NAMES = {
    "EICAR_Test_File",
    "Office_Macro_AutoExec",
    "Suspicious_Encoded_Chain",
    "PHP_Webshell_Generic",
    "Phishing_Shortened_URL_Social",
}


def _load(folder: str) -> list[dict[str, Any]]:
    entries = []
    for path in sorted((FIXTURES / folder).glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        payload["file"] = path.name
        entries.append(payload)
    return entries


POSITIVE = _load("positive")
NEGATIVE = _load("negative")


@pytest.fixture(scope="module")
def sigma(rules_root: Path) -> SigmaRuleSet:
    return SigmaRuleSet(rules_root / "sigma")


@pytest.fixture(scope="module")
def yara(rules_root: Path) -> YaraScanner:
    return YaraScanner(rules_root / "yara")


def fired_rules(sigma: SigmaRuleSet, yara: YaraScanner, record: dict[str, Any]) -> set[str]:
    """Rule ids (Sigma lab ids + YARA rule names) that match the record."""
    event = normalize(record)
    hits = {name for name, _ in yara.scan(event.get("text", ""))}
    hits |= {rule.id for rule in sigma.rules.values() if rule.match(event)[0]}
    return hits


def test_fixture_inventory() -> None:
    assert len(POSITIVE) == 25, "one positive fixture per published rule"
    assert len(NEGATIVE) == 25, "one negative fixture per published rule"
    assert {entry["rule"] for entry in POSITIVE} == SIGMA_RULE_IDS | YARA_RULE_NAMES
    assert {entry["rule"] for entry in NEGATIVE} == SIGMA_RULE_IDS | YARA_RULE_NAMES


def test_positive_fixtures_declare_their_expectations() -> None:
    for entry in POSITIVE:
        assert entry["file"] == f"{entry['rule']}.json", entry["file"]
        assert entry["expect"], entry["file"]
        unknown = set(entry["expect"]) - (SIGMA_RULE_IDS | YARA_RULE_NAMES)
        assert not unknown, f"{entry['file']}: unknown rules {sorted(unknown)}"
        assert entry["rule"] in entry["expect"], entry["file"]


def test_negative_fixtures_match_their_rule() -> None:
    for entry in NEGATIVE:
        assert entry["file"] == f"{entry['rule']}.json", entry["file"]


@pytest.mark.parametrize("entry", POSITIVE, ids=lambda entry: entry["rule"])
def test_positive_fixture_fires_exactly_the_expected_rules(
    sigma: SigmaRuleSet, yara: YaraScanner, entry: dict[str, Any]
) -> None:
    hits = fired_rules(sigma, yara, entry["event"])
    assert hits == set(entry["expect"]), (
        f"{entry['file']}: expected {sorted(entry['expect'])}, fired {sorted(hits)}"
    )


@pytest.mark.parametrize("entry", NEGATIVE, ids=lambda entry: entry["rule"])
def test_negative_fixture_fires_no_rule(
    sigma: SigmaRuleSet, yara: YaraScanner, entry: dict[str, Any]
) -> None:
    hits = fired_rules(sigma, yara, entry["event"])
    assert hits == set(), f"{entry['file']}: unexpected {sorted(hits)}"
