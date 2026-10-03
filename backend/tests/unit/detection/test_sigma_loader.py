"""Sigma subset: loading, sample matching, validation and hot reload."""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest

from app.detection.sigma_loader import (
    LOGSOURCE_CATEGORY_MAP,
    SigmaError,
    SigmaParseError,
    SigmaRuleSet,
    load_sigma_rule,
    redos_risk,
)

from tests.helpers import make_event

RULE_IDS = (
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
)


@pytest.fixture(scope="module")
def rule_set(rules_root: Path) -> SigmaRuleSet:
    return SigmaRuleSet(rules_root / "sigma")


def test_twenty_published_rules(rule_set: SigmaRuleSet) -> None:
    assert len(rule_set.rules) == 20
    for rule_id in RULE_IDS:
        assert rule_id in rule_set.rules, rule_id


def test_every_rule_carries_a_uuid(rule_set: SigmaRuleSet) -> None:
    import uuid as uuid_module

    for rule in rule_set.rules.values():
        uuid_module.UUID(rule.uuid)  # raises if the document id is not a UUID
        assert rule.uuid != rule.id or rule.id.count("-") == 4


def test_every_rule_has_match_and_no_match_samples(rule_set: SigmaRuleSet) -> None:
    for rule in rule_set.rules.values():
        assert rule.samples_match, f"{rule.id}: no lab_samples.match"
        assert rule.samples_no_match, f"{rule.id}: no lab_samples.no_match"


def test_match_samples_fire_their_rule(rule_set: SigmaRuleSet) -> None:
    for rule in rule_set.rules.values():
        for event in rule.samples_match:
            matched, bindings = rule.match(event)
            assert matched, f"{rule.id}: match sample did not fire"
            assert bindings, f"{rule.id}: fired without explanation bindings"


def test_no_match_samples_fire_no_rule(rule_set: SigmaRuleSet) -> None:
    for rule in rule_set.rules.values():
        for event in rule.samples_no_match:
            fired = [r.id for r in rule_set.rules.values() if r.match(event)[0]]
            assert fired == [], f"{rule.id}: no_match sample fired {fired}"


def test_logsource_filters_wrong_product(rule_set: SigmaRuleSet) -> None:
    rule = rule_set.rules["bs-auth-failed-logons"]
    linux_event = make_event(
        "2024-06-18T13:10:00Z", action="failed_logon", product="linux", event_id="4625"
    )
    assert rule.match(linux_event)[0] is False
    windows_event = make_event(
        "2024-06-18T13:10:00Z", action="failed_logon", product="windows", event_id="4625"
    )
    assert rule.match(windows_event)[0] is True


def test_logsource_category_maps_to_event_category(rule_set: SigmaRuleSet) -> None:
    rule = rule_set.rules["bs-web-sql-injection"]
    assert rule.category == "web_access"
    assert LOGSOURCE_CATEGORY_MAP["web_access"] == frozenset({"web"})
    wrong = make_event(
        "2024-07-03T09:15:20Z",
        category="auth",
        action="http_request",
        url="/x?id=1'%20OR%20'1'='1",
    )
    assert rule.match(wrong)[0] is False


def test_explanation_bindings_name_the_matching_field(rule_set: SigmaRuleSet) -> None:
    rule = rule_set.rules["bs-proc-temp-folder-execution"]
    event = rule.samples_match[0]
    matched, bindings = rule.match(event)
    assert matched
    fields = {binding["field"] for binding in bindings}
    assert "path" in fields
    path_binding = next(b for b in bindings if b["field"] == "path")
    assert path_binding["op"] == "contains|i"


def test_condition_syntax_errors_are_rejected(tmp_path: Path) -> None:
    bad = tmp_path / "bad.yml"
    bad.write_text(
        textwrap.dedent(
            """
            title: Bad
            id: bad-condition
            description: x
            logsource:
              product: windows
            detection:
              selection:
                category: auth
              condition: selection and does_not_exist
            level: low
            lab_samples:
              match: [{timestamp: '2024-01-01T00:00:00Z', category: auth, action: logon}]
              no_match: [{timestamp: '2024-01-01T00:00:00Z', category: process, action: process_start}]
            """
        ),
        encoding="utf-8",
    )
    with pytest.raises(SigmaParseError, match="unknown selection"):
        load_sigma_rule(bad)


def test_unknown_modifier_is_rejected(tmp_path: Path) -> None:
    bad = tmp_path / "bad.yml"
    bad.write_text(
        textwrap.dedent(
            """
            title: Bad
            id: bad-modifier
            description: x
            logsource: {product: windows}
            detection:
              selection:
                host|bogus: WS-1
              condition: selection
            level: low
            lab_samples:
              match: [{timestamp: '2024-01-01T00:00:00Z', category: auth, action: logon}]
              no_match: [{timestamp: '2024-01-01T00:00:00Z', category: auth, action: failed_logon}]
            """
        ),
        encoding="utf-8",
    )
    with pytest.raises(SigmaParseError, match="unknown modifier"):
        load_sigma_rule(bad)


def test_nested_maps_are_rejected(tmp_path: Path) -> None:
    bad = tmp_path / "bad.yml"
    bad.write_text(
        textwrap.dedent(
            """
            title: Bad
            id: bad-nested
            description: x
            logsource: {product: windows}
            detection:
              selection:
                process:
                  name: cmd.exe
              condition: selection
            level: low
            lab_samples:
              match: [{timestamp: '2024-01-01T00:00:00Z', category: auth, action: logon}]
              no_match: [{timestamp: '2024-01-01T00:00:00Z', category: auth, action: failed_logon}]
            """
        ),
        encoding="utf-8",
    )
    with pytest.raises(SigmaParseError, match="nested maps"):
        load_sigma_rule(bad)


def test_unsupported_logsource_category_is_rejected(tmp_path: Path) -> None:
    bad = tmp_path / "bad.yml"
    bad.write_text(
        textwrap.dedent(
            """
            title: Bad
            id: bad-logsource
            description: x
            logsource: {category: network_traffic}
            detection:
              selection: {category: network}
              condition: selection
            level: low
            lab_samples:
              match: [{timestamp: '2024-01-01T00:00:00Z', category: network, action: outbound_connection}]
              no_match: [{timestamp: '2024-01-01T00:00:00Z', category: auth, action: logon}]
            """
        ),
        encoding="utf-8",
    )
    with pytest.raises(SigmaParseError, match="unsupported logsource.category"):
        load_sigma_rule(bad)


def test_redos_pattern_is_rejected(tmp_path: Path) -> None:
    bad = tmp_path / "bad.yml"
    bad.write_text(
        textwrap.dedent(
            """
            title: Bad
            id: bad-redos
            description: x
            logsource: {product: windows}
            detection:
              selection:
                host|re: '^(a+)+$'
              condition: selection
            level: low
            lab_samples:
              match: [{timestamp: '2024-01-01T00:00:00Z', category: auth, action: logon}]
              no_match: [{timestamp: '2024-01-01T00:00:00Z', category: auth, action: failed_logon}]
            """
        ),
        encoding="utf-8",
    )
    with pytest.raises(SigmaParseError, match="ReDoS|quantifier"):
        load_sigma_rule(bad)


def test_redos_risk_heuristic() -> None:
    assert redos_risk("(a+)+")
    assert redos_risk(r"(\d+)*")
    assert redos_risk("x" * 600)
    assert redos_risk(r"union(%20| )select") is None
    assert redos_risk("\\temp\\") is None


def test_missing_samples_are_rejected(tmp_path: Path) -> None:
    bad = tmp_path / "bad.yml"
    bad.write_text(
        textwrap.dedent(
            """
            title: Bad
            id: no-samples
            description: x
            logsource: {product: windows}
            detection:
              selection: {category: auth}
              condition: selection
            level: low
            """
        ),
        encoding="utf-8",
    )
    with pytest.raises(SigmaParseError, match="lab_samples"):
        load_sigma_rule(bad)


def test_hot_reload_picks_up_edits(tmp_path: Path) -> None:
    rule_dir = tmp_path / "sigma"
    rule_dir.mkdir()
    source = textwrap.dedent(
        """
        title: Reloadable
        id: reloadable-rule
        description: x
        logsource: {product: windows}
        detection:
          selection: {category: auth}
          condition: selection
        level: low
        lab_samples:
          match: [{timestamp: '2024-01-01T00:00:00Z', category: auth, action: logon}]
          no_match: [{timestamp: '2024-01-01T00:00:00Z', category: process, action: process_start}]
        """
    )
    path = rule_dir / "reloadable-rule.yml"
    path.write_text(source, encoding="utf-8")

    rules = SigmaRuleSet(rule_dir)
    assert rules.rules["reloadable-rule"].level == "low"
    assert rules.reload_if_changed() is False

    path.write_text(source.replace("level: low", "level: critical"), encoding="utf-8")
    stat = path.stat()
    path.touch()
    import os

    os.utime(path, (stat.st_atime, stat.st_mtime + 10))
    assert rules.reload_if_changed() is True
    assert rules.rules["reloadable-rule"].level == "critical"


def test_duplicate_ids_are_rejected(tmp_path: Path) -> None:
    rule_dir = tmp_path / "sigma"
    rule_dir.mkdir()
    body = textwrap.dedent(
        """
        title: Dup
        id: dup-rule
        description: x
        logsource: {product: windows}
        detection:
          selection: {category: auth}
          condition: selection
        level: low
        lab_samples:
          match: [{timestamp: '2024-01-01T00:00:00Z', category: auth, action: logon}]
          no_match: [{timestamp: '2024-01-01T00:00:00Z', category: process, action: process_start}]
        """
    )
    (rule_dir / "a.yml").write_text(body, encoding="utf-8")
    (rule_dir / "b.yml").write_text(body, encoding="utf-8")
    with pytest.raises(SigmaError, match="duplicate rule id"):
        SigmaRuleSet(rule_dir)
