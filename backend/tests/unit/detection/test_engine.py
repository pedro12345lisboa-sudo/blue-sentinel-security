"""Detection engine: scenarios end-to-end, de-duplication, latency, catalog."""

from __future__ import annotations

import time
from pathlib import Path

import pytest

from app.collectors.scenario_generator import ALL_SCENARIOS, SCENARIOS
from app.detection.engine import DEDUP_TTL_SECONDS, DetectionEngine
from app.detection.severity import rank
from tests.helpers import make_event


@pytest.fixture(scope="module")
def rules_root_path(rules_root: Path) -> Path:
    return rules_root


class TestScenarios:
    """Acceptance: every scenario fires exactly its expected rules."""

    @pytest.mark.parametrize("scenario", ALL_SCENARIOS, ids=lambda s: s.id)
    def test_scenario_expected_rules_and_severity(
        self, rules_root: Path, scenario
    ) -> None:
        engine = DetectionEngine(rules_root, scenario=scenario)
        for index, step in enumerate(scenario.iter_steps(), start=1):
            engine.process(step.record, f"evt-{index}")
        report = engine.complete()

        assert report["missing_rules"] == [], f"{scenario.id}: missing {report['missing_rules']}"
        assert report["unexpected_rules"] == [], (
            f"{scenario.id}: unexpected {report['unexpected_rules']}"
        )
        assert report["final_severity"] == scenario.expected_severity
        assert set(report["rules_fired"]) == set(scenario.expected_rules)

    @pytest.mark.parametrize("scenario", ALL_SCENARIOS, ids=lambda s: s.id)
    def test_scenario_creates_and_closes_an_incident(
        self, rules_root: Path, scenario
    ) -> None:
        engine = DetectionEngine(rules_root, scenario=scenario)
        for index, step in enumerate(scenario.iter_steps(), start=1):
            engine.process(step.record, f"evt-{index}")
        report = engine.complete()

        incident = report["incident"]
        assert incident is not None, f"{scenario.id}: no incident"
        assert incident["status"] == "closed"
        assert rank(incident["severity"]) >= rank("high")
        assert incident["mitre"], f"{scenario.id}: incident has no MITRE tags"
        assert set(incident["expected_rules"]) == set(scenario.expected_rules)
        kinds = {entry["kind"] for entry in incident["timeline"]}
        assert "incident_opened" in kinds
        assert "incident_closed" in kinds
        assert incident["alert_ids"], f"{scenario.id}: incident references no alert"
        assert len(incident["timeline"]) >= 2

    @pytest.mark.parametrize("scenario", ALL_SCENARIOS, ids=lambda s: s.id)
    def test_scenario_alerts_are_emitted_before_completion(
        self, rules_root: Path, scenario
    ) -> None:
        engine = DetectionEngine(rules_root, scenario=scenario)
        total_alerts = 0
        for index, step in enumerate(scenario.iter_steps(), start=1):
            result = engine.process(step.record, f"evt-{index}")
            total_alerts += len(result.alerts)
            for alert in result.alerts:
                assert alert.severity in (
                    "informational",
                    "low",
                    "medium",
                    "high",
                    "critical",
                )
                assert alert.matched_fields, alert.rule_id
        assert total_alerts >= 1
        assert total_alerts == engine.stats["alerts"]


class TestDeduplication:
    def _engine(self, rules_root: Path) -> DetectionEngine:
        return DetectionEngine(rules_root, scenario=SCENARIOS["brute-force"])

    def test_same_rule_within_ttl_folds_into_one_alert(self, rules_root: Path) -> None:
        engine = self._engine(rules_root)
        first = engine.process(
            _failed_record("2024-06-18T13:10:00"), "evt-1"
        ).alerts
        second = engine.process(
            _failed_record("2024-06-18T13:10:30"), "evt-2"
        ).alerts
        assert len(first) == 1
        assert second == []
        assert engine.alerts[first[0].id].count == 2
        assert engine.stats["suppressed"] == 1
        assert engine.stats["alerts"] == 1

    def test_alert_resurfaces_after_ttl(self, rules_root: Path) -> None:
        engine = self._engine(rules_root)
        engine.process(_failed_record("2024-06-18T13:10:00"), "evt-1")
        later = engine.process(
            _failed_record("2024-06-18T13:12:01"), "evt-2"
        ).alerts
        assert len(later) == 1
        assert engine.stats["alerts"] == 2
        assert DEDUP_TTL_SECONDS == 120.0

    def test_different_hosts_do_not_fold(self, rules_root: Path) -> None:
        engine = self._engine(rules_root)
        engine.process(_failed_record("2024-06-18T13:10:00"), "evt-1")
        other = engine.process(
            _failed_record("2024-06-18T13:10:10", host="WS-OTHER"), "evt-2"
        ).alerts
        assert len(other) == 1


class TestLatency:
    def test_full_scenarios_process_well_under_one_second(
        self, rules_root: Path
    ) -> None:
        started = time.perf_counter()
        for scenario in ALL_SCENARIOS:
            engine = DetectionEngine(rules_root, scenario=scenario)
            for index, step in enumerate(scenario.iter_steps(), start=1):
                engine.process(step.record, f"evt-{index}")
            report = engine.complete()
            assert report["max_process_ms"] < 250
        wall_ms = (time.perf_counter() - started) * 1000
        assert wall_ms < 1000, f"all scenarios took {wall_ms:.0f} ms"

    def test_no_rule_evaluation_exceeds_the_soft_budget(
        self, rules_root: Path
    ) -> None:
        for scenario in ALL_SCENARIOS:
            engine = DetectionEngine(rules_root, scenario=scenario)
            for index, step in enumerate(scenario.iter_steps(), start=1):
                engine.process(step.record, f"evt-{index}")
            assert engine.stats["slow_evaluations"] == 0
            for rule_id, metric in engine.stats["rule_ms"].items():
                assert metric["max_ms"] < 50, f"{rule_id}: {metric['max_ms']:.1f} ms"


class TestCatalogAndEducation:
    def test_catalog_lists_all_rule_kinds(self, rules_root: Path) -> None:
        engine = DetectionEngine(rules_root)
        catalog = engine.rule_catalog()
        kinds = {entry["kind"] for entry in catalog}
        assert kinds == {"sigma", "yara", "correlation"}
        assert sum(1 for e in catalog if e["kind"] == "sigma") >= 8
        assert sum(1 for e in catalog if e["kind"] == "yara") >= 2
        assert sum(1 for e in catalog if e["kind"] == "correlation") >= 2
        for entry in catalog:
            assert entry["id"] and entry["title"]
            assert entry["level"] in ("informational", "low", "medium", "high", "critical")
            assert entry["description"]
            assert entry["response"], entry["id"]
            assert entry["false_positives"], entry["id"]

    def test_get_rule_explains_a_sigma_rule(self, rules_root: Path) -> None:
        engine = DetectionEngine(rules_root)
        document = engine.get_rule("bs-proc-temp-folder-execution")
        assert document is not None
        assert document["kind"] == "sigma"
        assert document["condition"] == "selection"
        assert document["logsource"]["product"] == "windows"
        assert document["source"].endswith(".yml")

    def test_get_rule_explains_a_yara_rule(self, rules_root: Path) -> None:
        engine = DetectionEngine(rules_root)
        document = engine.get_rule("Web_SQLi_Access_Log")
        assert document is not None
        assert document["kind"] == "yara"
        assert document["strings"], document
        assert document["condition"]

    def test_get_rule_explains_a_correlation_pattern(self, rules_root: Path) -> None:
        engine = DetectionEngine(rules_root)
        document = engine.get_rule("corr-brute-force-sequence")
        assert document is not None
        assert document["kind"] == "correlation"
        assert document["window_seconds"] == 300
        assert [stage["id"] for stage in document["stages"]] == ["failed_logons", "success"]

    def test_get_rule_unknown_returns_none(self, rules_root: Path) -> None:
        assert DetectionEngine(rules_root).get_rule("nope") is None


class TestHotReloadResilience:
    def test_broken_edit_keeps_previous_rules(self, rules_root: Path, tmp_path: Path) -> None:
        import shutil

        import yaml

        rules_dir = tmp_path / "rules"
        shutil.copytree(rules_root, rules_dir)
        engine = DetectionEngine(rules_dir)

        good = engine.sigma.rules["bs-auth-failed-logons"]
        broken = rules_dir / "sigma" / "bs-auth-failed-logons.yml"
        document = yaml.safe_load(broken.read_text(encoding="utf-8"))
        document["detection"]["selection"]["host|bogus_modifier"] = "WS-1"
        broken.write_text(yaml.safe_dump(document), encoding="utf-8")
        stat = broken.stat()
        import os

        os.utime(broken, (stat.st_atime, stat.st_mtime + 10))

        engine.reload_if_changed()
        assert engine.stats["reload_errors"], "expected a reload error"
        assert "bs-auth-failed-logons" in engine.sigma.rules
        assert engine.sigma.rules["bs-auth-failed-logons"].level == good.level

        # restore a valid file -> reload succeeds and clears errors eventually
        broken.write_text(yaml.safe_dump({**document, "level": "high"}), encoding="utf-8")
        stat = broken.stat()
        os.utime(broken, (stat.st_atime, stat.st_mtime + 20))
        # fix the invalid modifier
        document = yaml.safe_load(broken.read_text(encoding="utf-8"))
        document["detection"]["selection"].pop("host|bogus_modifier")
        broken.write_text(yaml.safe_dump(document), encoding="utf-8")
        stat = broken.stat()
        os.utime(broken, (stat.st_atime, stat.st_mtime + 30))
        engine.reload_if_changed()
        assert engine.stats["reload_errors"] == []
        assert engine.sigma.rules["bs-auth-failed-logons"].level == "high"


def _failed_record(timestamp: str, host: str = "WS-DEMO-01") -> dict:
    return {
        "timestamp": timestamp,
        "category": "auth",
        "action": "failed_logon",
        "event_id": "4625",
        "host": host,
        "user": "jsilva",
        "ip": "203.0.113.77",
        "product": "windows",
        "message": "An account failed to log on.",
    }
