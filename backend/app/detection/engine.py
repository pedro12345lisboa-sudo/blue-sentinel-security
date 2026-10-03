"""Detection engine: Sigma + YARA + correlation + de-duplication + incident.

One :class:`DetectionEngine` instance belongs to one lab session. It owns
the rule collections (with hot reload), evaluates every normalised event,
de-duplicates alerts on the **simulated** clock, advances correlation
patterns and assembles a single incident with a didactic timeline.

Latency: evaluation is synchronous and in-memory; a lab event produces its
alert(s) in the same tick it is processed (well under the 1 s UI budget -
covered by ``test_engine_latency``).
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.collectors.base import Scenario
from app.collectors.normalizer import parse_timestamp, normalize
from app.detection.correlation import CorrelationEngine, PatternError, WindowStore
from app.detection.severity import at_least, max_severity, normalize as normalize_severity
from app.detection.sigma_loader import (
    RULE_TIMEOUT_S,
    Bindings,
    SigmaError,
    SigmaRuleSet,
)
from app.detection.yara_scanner import YaraError, YaraScanner

# Alerts with the same (rule, host, user) inside this simulated-time window
# are folded into the first alert instead of spamming the console.
DEDUP_TTL_SECONDS = 120.0

# A new incident is opened by correlation alerts or anything at/above "high".
INCIDENT_THRESHOLD = "high"

# Published repository of the rule files (the lab links each alert to its
# rule source on GitHub so the analyst can read it in context).
GITHUB_REPO = "pedro12345lisboa-sudo/blue-sentinel-security"
GITHUB_BRANCH = "main"
REPO_ROOT = Path(__file__).resolve().parents[3]


def default_rules_dir() -> Path:
    """``<repo>/rules`` relative to ``backend/app/detection/engine.py``."""
    return REPO_ROOT / "rules"


def github_blob_url(path: str | Path) -> str | None:
    """URL of ``path`` inside the published repository (None when outside it)."""
    try:
        relative = Path(path).resolve().relative_to(REPO_ROOT)
    except ValueError:
        # Rule copy outside the repo (tests building a temporary tree).
        return None
    return f"https://github.com/{GITHUB_REPO}/blob/{GITHUB_BRANCH}/{relative.as_posix()}"


@dataclass
class Alert:
    id: str
    kind: str  # sigma | yara | correlation
    rule_id: str
    title: str
    description: str
    severity: str
    mitre: tuple[str, ...]
    timestamp: str
    host: str
    user: str
    event_id: str
    count: int = 1
    matched_fields: Bindings = field(default_factory=list)
    false_positives: tuple[str, ...] = ()
    response: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "rule_id": self.rule_id,
            "title": self.title,
            "description": self.description,
            "severity": self.severity,
            "severity_label": self.severity.capitalize(),
            "mitre": list(self.mitre),
            "timestamp": self.timestamp,
            "host": self.host,
            "user": self.user,
            "event_id": self.event_id,
            "count": self.count,
            "matched_fields": list(self.matched_fields),
            "false_positives": list(self.false_positives),
            "response": list(self.response),
        }


@dataclass
class Incident:
    id: str
    title: str
    description: str
    scenario_id: str
    scenario_name: str
    opened_at: str
    opened_by: str
    severity: str
    status: str  # open | closed
    alert_ids: list[str]
    timeline: list[dict[str, Any]]
    mitre: list[str]
    response: list[str]
    false_positives: list[str]
    expected_rules: list[str]
    expected_severity: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "scenario_id": self.scenario_id,
            "scenario_name": self.scenario_name,
            "opened_at": self.opened_at,
            "opened_by": self.opened_by,
            "severity": self.severity,
            "severity_label": self.severity.capitalize(),
            "status": self.status,
            "alert_ids": list(self.alert_ids),
            "timeline": list(self.timeline),
            "mitre": list(self.mitre),
            "response": list(self.response),
            "false_positives": list(self.false_positives),
            "expected_rules": list(self.expected_rules),
            "expected_severity": self.expected_severity,
        }


@dataclass
class ProcessingResult:
    event: dict[str, Any]
    alerts: list[Alert]
    incident: dict[str, Any] | None


def _epoch(timestamp: str) -> float:
    return parse_timestamp(timestamp).timestamp()


class DetectionEngine:
    """Session-scoped detection pipeline."""

    def __init__(
        self,
        rules_root: str | Path | None = None,
        scenario: Scenario | None = None,
        store: WindowStore | None = None,
    ) -> None:
        root = Path(rules_root) if rules_root is not None else default_rules_dir()
        self.rules_root = root
        self.scenario = scenario
        self.sigma = SigmaRuleSet(root / "sigma")
        self.yara = YaraScanner(root / "yara")
        self.correlation = CorrelationEngine.from_directory(root / "patterns", store=store)

        self.alerts: dict[str, Alert] = {}
        self.incident: Incident | None = None
        self.completed_report: dict[str, Any] | None = None

        self._alert_seq = 0
        self._incident_seq = 0
        self._dedup: dict[tuple[str, str, str], float] = {}
        self._alert_by_key: dict[tuple[str, str, str], str] = {}
        self._last_event_ts: str | None = None

        self.stats: dict[str, Any] = {
            "events": 0,
            "alerts": 0,
            "suppressed": 0,
            "correlation_fires": 0,
            "slow_evaluations": 0,
            "reload_errors": [],
            "rule_ms": {},
            "max_process_ms": 0.0,
        }

    # -- rules ---------------------------------------------------------------

    def rule_catalog(self) -> list[dict[str, Any]]:
        """Rule summary sent with the WS ``connected`` message."""
        catalog: list[dict[str, Any]] = [
            {
                "id": rule.id,
                "title": rule.title,
                "level": rule.level,
                "mitre": list(rule.mitre),
                "kind": "sigma",
                "false_positives": list(rule.false_positives),
                "response": list(rule.response),
                "description": rule.description,
            }
            for rule in self.sigma.rules.values()
        ]
        catalog.extend(
            {
                "id": rule.name,
                "title": rule.title,
                "level": rule.level,
                "mitre": list(rule.mitre),
                "kind": "yara",
                "false_positives": list(rule.false_positives),
                "response": list(rule.response),
                "description": rule.title,
            }
            for rule in self.yara.rules.values()
        )
        catalog.extend(
            {
                "id": pattern.id,
                "title": pattern.title,
                "level": pattern.severity,
                "mitre": list(pattern.mitre),
                "kind": "correlation",
                "false_positives": list(pattern.false_positives),
                "response": list(pattern.response),
                "description": pattern.description,
            }
            for pattern in self.correlation.patterns.values()
        )
        return catalog

    def get_rule(self, rule_id: str) -> dict[str, Any] | None:
        """Full rule document for the educational explanation panel."""
        for entry in self.rule_catalog():
            if entry["id"] == rule_id:
                entry = dict(entry)
                if entry["kind"] == "sigma":
                    rule = self.sigma.rules[rule_id]
                    entry["logsource"] = {
                        "product": rule.product,
                        "category": rule.category,
                        "service": rule.service,
                    }
                    entry["condition"] = rule.condition_text
                    source_path = rule.source
                elif entry["kind"] == "yara":
                    rule = self.yara.rules[rule_id]
                    entry["condition"] = rule.condition_text
                    entry["strings"] = [
                        {"id": identifier, "literal": s.literal}
                        for identifier, s in rule.strings.items()
                    ]
                    source_path = rule.source
                else:
                    pattern = self.correlation.patterns[rule_id]
                    entry["window_seconds"] = pattern.window_seconds
                    entry["group_by"] = list(pattern.group_by)
                    entry["stages"] = [
                        {
                            "id": stage.id,
                            "min_events": stage.min_events,
                            "rule_ids": list(stage.rule_ids),
                        }
                        for stage in pattern.stages
                    ]
                    source_path = pattern.source
                entry["source"] = Path(source_path).name
                entry["source_url"] = github_blob_url(source_path)
                return entry
        return None

    def reload_if_changed(self) -> bool:
        """Hot-reload rules edited on disk; a bad edit never kills a session."""
        changed = False
        errors: list[str] = []
        for name, loader in (
            ("sigma", self.sigma.reload_if_changed),
            ("yara", self.yara.reload_if_changed),
            ("patterns", self.correlation.reload_if_changed),
        ):
            try:
                changed = loader() or changed
            except (SigmaError, YaraError, PatternError) as exc:
                errors.append(f"{name}: {exc}")
        self.stats["reload_errors"] = errors[-5:]
        return changed

    # -- event pipeline --------------------------------------------------------

    def process(self, record: dict[str, Any], event_id: str) -> ProcessingResult:
        """Normalise one synthetic record and run the full pipeline."""
        started = time.perf_counter()
        self.reload_if_changed()

        event = normalize(record, event_id)
        self.stats["events"] += 1
        self._last_event_ts = event["timestamp"]

        alerts: list[Alert] = []

        # Sigma rules (one evaluation per rule, timed).
        matched_rule_ids: set[str] = set()
        for rule_id, rule in self.sigma.rules.items():
            eval_started = time.perf_counter()
            matched, bindings = rule.match(event)
            elapsed_ms = (time.perf_counter() - eval_started) * 1000.0
            metric = self.stats["rule_ms"].setdefault(rule_id, {"evals": 0, "max_ms": 0.0})
            metric["evals"] += 1
            metric["max_ms"] = max(metric["max_ms"], elapsed_ms)
            if elapsed_ms > RULE_TIMEOUT_S * 1000:
                self.stats["slow_evaluations"] += 1
            if matched:
                matched_rule_ids.add(rule_id)
                alert = self._emit(
                    kind="sigma",
                    rule_id=rule_id,
                    title=rule.title,
                    description=rule.description,
                    severity=rule.level,
                    mitre=rule.mitre,
                    false_positives=rule.false_positives,
                    response=rule.response,
                    bindings=bindings,
                    event=event,
                )
                if alert is not None:
                    alerts.append(alert)

        # YARA rules (the whole collection scans the free-text field once).
        yara_started = time.perf_counter()
        yara_hits = self.yara.scan(event.get("text", ""))
        yara_ms = (time.perf_counter() - yara_started) * 1000.0
        metric = self.stats["rule_ms"].setdefault("yara.scan", {"evals": 0, "max_ms": 0.0})
        metric["evals"] += 1
        metric["max_ms"] = max(metric["max_ms"], yara_ms)
        for rule_name, bindings in yara_hits:
            matched_rule_ids.add(rule_name)
            rule = self.yara.rules[rule_name]
            alert = self._emit(
                kind="yara",
                rule_id=rule_name,
                title=rule_name,
                description=rule.title,
                severity=rule.level,
                mitre=rule.mitre,
                false_positives=rule.false_positives,
                response=rule.response,
                bindings=bindings,
                event=event,
            )
            if alert is not None:
                alerts.append(alert)

        # Correlation consumes every raw match (even de-duplicated ones).
        for raw in self.correlation.feed(event, matched_rule_ids):
            alert = self._emit(
                kind="correlation",
                rule_id=raw["rule_id"],
                title=raw["title"],
                description=raw["description"],
                severity=raw["severity"],
                mitre=tuple(raw["mitre"]),
                false_positives=tuple(raw["false_positives"]),
                response=tuple(raw["response"]),
                bindings=raw["matched_fields"],
                event=event,
                count=raw["count"],
            )
            if alert is not None:
                alerts.append(alert)
                self.stats["correlation_fires"] += 1

        incident_snapshot = None
        if alerts:
            incident_snapshot = self.incident.to_dict() if self.incident else None

        elapsed_total_ms = (time.perf_counter() - started) * 1000.0
        self.stats["max_process_ms"] = max(self.stats["max_process_ms"], elapsed_total_ms)
        return ProcessingResult(event=event, alerts=alerts, incident=incident_snapshot)

    def _emit(
        self,
        *,
        kind: str,
        rule_id: str,
        title: str,
        description: str,
        severity: str,
        mitre: tuple[str, ...],
        false_positives: tuple[str, ...],
        response: tuple[str, ...],
        bindings: Bindings,
        event: dict[str, Any],
        count: int = 1,
    ) -> Alert | None:
        """Create (or fold into) an alert, honouring simulated de-duplication."""
        severity = normalize_severity(severity)
        key = (rule_id, str(event.get("host", "-")), str(event.get("user", "-")))
        ts = _epoch(event["timestamp"])
        last_seen = self._dedup.get(key)
        if last_seen is not None and (ts - last_seen) < DEDUP_TTL_SECONDS:
            existing_id = self._alert_by_key.get(key)
            existing = self.alerts.get(existing_id) if existing_id else None
            if existing is not None:
                existing.count += count
            self.stats["suppressed"] += 1
            return None

        self._dedup[key] = ts
        self._alert_seq += 1
        alert = Alert(
            id=f"alert-{self._alert_seq}",
            kind=kind,
            rule_id=rule_id,
            title=title,
            description=description,
            severity=severity,
            mitre=mitre,
            timestamp=event["timestamp"],
            host=str(event.get("host", "-")),
            user=str(event.get("user", "-")),
            event_id=event["id"],
            count=count,
            matched_fields=bindings,
            false_positives=false_positives,
            response=response,
        )
        self.alerts[alert.id] = alert
        self._alert_by_key[key] = alert.id
        self.stats["alerts"] += 1
        self._update_incident(alert)
        return alert

    # -- incident -------------------------------------------------------------

    @staticmethod
    def _merge(*groups: Any) -> list[str]:
        merged: list[str] = []
        for group in groups:
            for item in group:
                if item not in merged:
                    merged.append(item)
        return merged

    @staticmethod
    def _merge_mitre(*groups: Any) -> list[str]:
        merged: list[str] = []
        for group in groups:
            for technique in group:
                if technique not in merged:
                    merged.append(technique)
        return merged

    def _update_incident(self, alert: Alert) -> None:
        if self.incident is None:
            if not (alert.kind == "correlation" or at_least(alert.severity, INCIDENT_THRESHOLD)):
                return
            scenario = self.scenario
            self._incident_seq += 1
            earlier = [existing for existing in self.alerts.values() if existing.id != alert.id]
            timeline: list[dict[str, Any]] = [
                {
                    "ts": existing.timestamp,
                    "kind": existing.kind,
                    "ref": existing.id,
                    "text": existing.title,
                    "severity": existing.severity,
                }
                for existing in earlier
            ]
            timeline.append(
                {
                    "ts": alert.timestamp,
                    "kind": "incident_opened",
                    "ref": alert.id,
                    "text": f"Incident opened by {alert.rule_id}",
                    "severity": alert.severity,
                }
            )
            self.incident = Incident(
                id=f"inc-{self._incident_seq}",
                title=f"{scenario.name if scenario else 'Detection'} - {alert.severity} incident",
                description=(
                    scenario.description
                    if scenario is not None
                    else "Incident opened by the detection engine."
                ),
                scenario_id=scenario.id if scenario is not None else "-",
                scenario_name=scenario.name if scenario is not None else "-",
                opened_at=alert.timestamp,
                opened_by=alert.id,
                severity=alert.severity,
                status="open",
                alert_ids=[existing.id for existing in earlier] + [alert.id],
                timeline=timeline,
                mitre=self._merge_mitre(
                    [technique for existing in earlier for technique in existing.mitre],
                    alert.mitre,
                ),
                response=self._merge(
                    [item for existing in earlier for item in existing.response],
                    alert.response,
                ),
                false_positives=self._merge(
                    [item for existing in earlier for item in existing.false_positives],
                    alert.false_positives,
                ),
                expected_rules=list(scenario.expected_rules) if scenario else [],
                expected_severity=scenario.expected_severity if scenario else "-",
            )
            return

        incident = self.incident
        incident.alert_ids.append(alert.id)
        incident.timeline.append(
            {
                "ts": alert.timestamp,
                "kind": alert.kind,
                "ref": alert.id,
                "text": alert.title,
                "severity": alert.severity,
            }
        )
        incident.severity = max_severity([incident.severity, alert.severity])
        incident.mitre = self._merge_mitre(incident.mitre, alert.mitre)
        incident.response = self._merge(incident.response, alert.response)
        incident.false_positives = self._merge(
            incident.false_positives, alert.false_positives
        )

    # -- completion -----------------------------------------------------------

    def complete(self) -> dict[str, Any]:
        """Close the incident (if any) and build the final session report."""
        if self.completed_report is not None:
            return self.completed_report

        if self.incident is not None:
            self.incident.status = "closed"
            self.incident.timeline.append(
                {
                    "ts": self._last_event_ts or self.incident.opened_at,
                    "kind": "incident_closed",
                    "ref": self.incident.id,
                    "text": "Scenario completed - incident handed to the analyst",
                    "severity": self.incident.severity,
                }
            )

        scenario = self.scenario
        fired = sorted({alert.rule_id for alert in self.alerts.values()})
        expected = list(scenario.expected_rules) if scenario else []
        observed_severity = max_severity([alert.severity for alert in self.alerts.values()])

        self.completed_report = {
            "scenario_id": scenario.id if scenario else "-",
            "scenario_name": scenario.name if scenario else "-",
            "events": self.stats["events"],
            "alerts": self.stats["alerts"],
            "suppressed": self.stats["suppressed"],
            "correlation_fires": self.stats["correlation_fires"],
            "rules_fired": fired,
            "expected_rules": expected,
            "missing_rules": [rule for rule in expected if rule not in fired],
            "unexpected_rules": [rule for rule in fired if rule not in expected],
            "final_severity": observed_severity,
            "expected_severity": scenario.expected_severity if scenario else "-",
            "incident": self.incident.to_dict() if self.incident else None,
            "yara_engine": "yara-python" if self.yara.using_native_engine else "builtin",
            "rule_ms": dict(self.stats["rule_ms"]),
            "slow_evaluations": self.stats["slow_evaluations"],
            "max_process_ms": round(self.stats["max_process_ms"], 3),
        }
        return self.completed_report
