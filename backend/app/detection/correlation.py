"""Time-window correlation for the detection lab.

Patterns live in ``rules/patterns/*.yaml`` and describe a multi-stage
sequence over normalised events:

* ``window_seconds`` - sliding window measured on the **simulated** event
  clock (so behaviour is identical at 1x or 4x speed),
* ``group_by`` - fields that must match for events to be grouped together
  (e.g. ``[host, user]``),
* ``stages`` - ordered conditions; each stage references rule id(s)
  (``rule_ids``) and/or an event selection, and needs ``min_events``
  qualifying events. Stage *n* can only complete after stage *n-1*.

Windows are kept in a :class:`WindowStore`. ``MemoryWindowStore`` is the
default (a session lasts minutes; nothing needs to survive a restart).
``RedisWindowStore`` implements the same interface for deployments that
already run Redis - it is optional and only imported when wired in.
"""

from __future__ import annotations

import ipaddress  # noqa: F401  (kept: FieldCondition cidr reuses stdlib here)
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Protocol

import yaml

from app.collectors.normalizer import parse_timestamp, sigma_view
from app.detection.mitre import is_catalogued
from app.detection.severity import normalize as normalize_severity
from app.detection.sigma_loader import FieldCondition, SigmaError, _compile_selection


class PatternError(ValueError):
    """A correlation pattern document is invalid."""


# --- pattern model ---------------------------------------------------------


@dataclass(frozen=True)
class Stage:
    id: str
    min_events: int
    rule_ids: tuple[str, ...]
    selection: tuple[FieldCondition, ...] | None

    def matches(self, event: dict[str, Any], matched_rule_ids: set[str]) -> bool:
        """True when this event contributes to the stage (sources are OR-ed)."""
        if self.rule_ids and matched_rule_ids.intersection(self.rule_ids):
            return True
        if self.selection is not None:
            view = sigma_view(event)
            return all(condition.evaluate(view)[0] for condition in self.selection)
        return False


@dataclass(frozen=True)
class Pattern:
    id: str
    title: str
    description: str
    severity: str
    window_seconds: float
    group_by: tuple[str, ...]
    stages: tuple[Stage, ...]
    mitre: tuple[str, ...]
    false_positives: tuple[str, ...]
    response: tuple[str, ...]
    source: str
    mtime_ns: int

    def group_values(self, event: dict[str, Any]) -> tuple[str, ...]:
        return tuple(str(event.get(field, "-")) for field in self.group_by)

    @staticmethod
    def storage_key(group_values: Iterable[str]) -> str:
        return json.dumps(list(group_values), separators=(",", ":"))


def _string_list(value: Any, where: str, key: str) -> tuple[str, ...]:
    if value is None:
        return ()
    if isinstance(value, str):
        return (value,)
    if isinstance(value, list) and all(isinstance(item, str) for item in value):
        return tuple(value)
    raise PatternError(f"{where}: {key} must be a string or a list of strings")


def load_pattern(path: Path) -> Pattern:
    where = str(path)
    try:
        document = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise PatternError(f"{where}: invalid YAML: {exc}") from exc
    if not isinstance(document, dict):
        raise PatternError(f"{where}: pattern must be a mapping")

    for key in ("id", "title", "description", "severity", "window_seconds", "group_by", "stages"):
        if key not in document:
            raise PatternError(f"{where}: missing required field {key!r}")

    pattern_id = str(document["id"]).strip()
    if not pattern_id:
        raise PatternError(f"{where}: id must not be empty")

    try:
        severity = normalize_severity(document["severity"])
    except Exception as exc:
        raise PatternError(f"{where}: {exc}") from exc

    window = document["window_seconds"]
    if isinstance(window, bool) or not isinstance(window, (int, float)) or window <= 0:
        raise PatternError(f"{where}: window_seconds must be a positive number")
    if window > 3600:
        raise PatternError(f"{where}: window_seconds must not exceed 3600")

    group_by_raw = document["group_by"]
    if not isinstance(group_by_raw, list) or not group_by_raw:
        raise PatternError(f"{where}: group_by must be a non-empty list of field names")
    if not all(isinstance(field, str) and field for field in group_by_raw):
        raise PatternError(f"{where}: group_by entries must be non-empty strings")
    group_by = tuple(group_by_raw)

    stages_raw = document["stages"]
    if not isinstance(stages_raw, list) or not stages_raw:
        raise PatternError(f"{where}: stages must be a non-empty list")
    stages: list[Stage] = []
    seen: set[str] = set()
    for index, raw_stage in enumerate(stages_raw):
        if not isinstance(raw_stage, dict):
            raise PatternError(f"{where}: stages[{index}] must be a mapping")
        for key in ("id", "min_events", "source"):
            if key not in raw_stage:
                raise PatternError(f"{where}: stages[{index}] is missing {key!r}")
        stage_id = str(raw_stage["id"]).strip()
        if not stage_id or stage_id in seen:
            raise PatternError(f"{where}: stage id {stage_id!r} is empty or duplicated")
        seen.add(stage_id)
        min_events = raw_stage["min_events"]
        if isinstance(min_events, bool) or not isinstance(min_events, int) or min_events < 1:
            raise PatternError(f"{where}: stage {stage_id!r} min_events must be a positive integer")
        source = raw_stage["source"]
        if not isinstance(source, dict) or not source:
            raise PatternError(f"{where}: stage {stage_id!r} source must be a non-empty mapping")
        rule_ids_raw = source.get("rule_ids", ())
        if not isinstance(rule_ids_raw, (list, tuple)) or not all(
            isinstance(item, str) and item for item in rule_ids_raw
        ):
            raise PatternError(f"{where}: stage {stage_id!r} source.rule_ids must be a list of strings")
        selection: tuple[FieldCondition, ...] | None = None
        if "event" in source:
            try:
                selection = _compile_selection(f"{stage_id}.event", source["event"], where)
            except SigmaError as exc:
                raise PatternError(f"{where}: stage {stage_id!r}: {exc}") from exc
        if not rule_ids_raw and selection is None:
            raise PatternError(
                f"{where}: stage {stage_id!r} needs source.rule_ids and/or source.event"
            )
        stages.append(Stage(stage_id, min_events, tuple(rule_ids_raw), selection))

    mitre_raw = document.get("mitre", [])
    if not isinstance(mitre_raw, list) or not all(isinstance(item, str) for item in mitre_raw):
        raise PatternError(f"{where}: mitre must be a list of technique ids")
    for technique in mitre_raw:
        if not is_catalogued(technique):
            raise PatternError(f"{where}: invalid MITRE technique {technique!r}")

    return Pattern(
        id=pattern_id,
        title=str(document["title"]).strip(),
        description=" ".join(str(document["description"]).split()),
        severity=severity,
        window_seconds=float(window),
        group_by=group_by,
        stages=tuple(stages),
        mitre=tuple(mitre_raw),
        false_positives=_string_list(document.get("false_positives"), where, "false_positives"),
        response=_string_list(document.get("response"), where, "response"),
        source=where,
        mtime_ns=path.stat().st_mtime_ns,
    )


def _pattern_paths(directory: Path) -> list[Path]:
    return sorted(directory.glob("*.yml")) + sorted(directory.glob("*.yaml"))


# --- window stores ---------------------------------------------------------


class WindowStore(Protocol):
    """Storage for per-group correlation state."""

    def entries(self, pattern_id: str, group: str, stage_id: str) -> list[list[Any]]: ...

    def set_entries(
        self, pattern_id: str, group: str, stage_id: str, entries: list[list[Any]]
    ) -> None: ...

    def completions(self, pattern_id: str, group: str) -> dict[str, float]: ...

    def set_completions(self, pattern_id: str, group: str, completions: dict[str, float]) -> None: ...

    def reset(self, pattern_id: str, group: str) -> None: ...


class MemoryWindowStore:
    """In-process window store (default)."""

    def __init__(self) -> None:
        self._entries: dict[tuple[str, str, str], list[list[Any]]] = {}
        self._completions: dict[tuple[str, str], dict[str, float]] = {}

    def entries(self, pattern_id: str, group: str, stage_id: str) -> list[list[Any]]:
        return [list(item) for item in self._entries.get((pattern_id, group, stage_id), [])]

    def set_entries(
        self, pattern_id: str, group: str, stage_id: str, entries: list[list[Any]]
    ) -> None:
        key = (pattern_id, group, stage_id)
        if entries:
            self._entries[key] = [list(item) for item in entries]
        else:
            self._entries.pop(key, None)

    def completions(self, pattern_id: str, group: str) -> dict[str, float]:
        return dict(self._completions.get((pattern_id, group), {}))

    def set_completions(self, pattern_id: str, group: str, completions: dict[str, float]) -> None:
        key = (pattern_id, group)
        if completions:
            self._completions[key] = dict(completions)
        else:
            self._completions.pop(key, None)

    def reset(self, pattern_id: str, group: str) -> None:
        self._completions.pop((pattern_id, group), None)
        for stage_key in [key for key in self._entries if key[0] == pattern_id and key[1] == group]:
            self._entries.pop(stage_key, None)


class RedisWindowStore:
    """Redis-backed window store (optional; wire in when Redis is available).

    State is a single JSON blob per (pattern, group) so a group can be
    cleared with one ``DELETE``. Not instantiated by the app unless a Redis
    client is provided - the lab defaults to :class:`MemoryWindowStore`.
    """

    def __init__(self, client: Any, prefix: str = "bs:lab:corr", ttl_seconds: int = 7200) -> None:
        self.client = client
        self.prefix = prefix
        self.ttl_seconds = ttl_seconds

    def _key(self, pattern_id: str, group: str) -> str:
        return f"{self.prefix}:{pattern_id}:{group}"

    def _load(self, pattern_id: str, group: str) -> dict[str, Any]:
        raw = self.client.get(self._key(pattern_id, group))
        if not raw:
            return {"stages": {}, "completions": {}}
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        return json.loads(raw)

    def _save(self, pattern_id: str, group: str, state: dict[str, Any]) -> None:
        self.client.set(self._key(pattern_id, group), json.dumps(state), ex=self.ttl_seconds)

    def entries(self, pattern_id: str, group: str, stage_id: str) -> list[list[Any]]:
        return self._load(pattern_id, group)["stages"].get(stage_id, [])

    def set_entries(
        self, pattern_id: str, group: str, stage_id: str, entries: list[list[Any]]
    ) -> None:
        state = self._load(pattern_id, group)
        if entries:
            state["stages"][stage_id] = entries
        else:
            state["stages"].pop(stage_id, None)
        self._save(pattern_id, group, state)

    def completions(self, pattern_id: str, group: str) -> dict[str, float]:
        return self._load(pattern_id, group)["completions"]

    def set_completions(self, pattern_id: str, group: str, completions: dict[str, float]) -> None:
        state = self._load(pattern_id, group)
        state["completions"] = completions
        self._save(pattern_id, group, state)

    def reset(self, pattern_id: str, group: str) -> None:
        self.client.delete(self._key(pattern_id, group))


# --- engine ----------------------------------------------------------------


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class CorrelationEngine:
    """Feed normalised events and get correlation alerts back."""

    def __init__(
        self,
        patterns: dict[str, Pattern],
        store: WindowStore | None = None,
        directory: str | Path | None = None,
    ) -> None:
        self.patterns = patterns
        self.store: WindowStore = store if store is not None else MemoryWindowStore()
        self.directory = Path(directory) if directory is not None else None
        self._mtimes: dict[str, int] = {
            pattern.source: pattern.mtime_ns for pattern in patterns.values()
        }

    @classmethod
    def from_directory(
        cls, directory: str | Path, store: WindowStore | None = None
    ) -> "CorrelationEngine":
        directory = Path(directory)
        paths = _pattern_paths(directory)
        if not paths:
            raise PatternError(f"no correlation patterns (*.yaml) found in {directory}")
        patterns: dict[str, Pattern] = {}
        for path in paths:
            pattern = load_pattern(path)
            if pattern.id in patterns:
                raise PatternError(f"duplicate pattern id {pattern.id!r} in {directory}")
            patterns[pattern.id] = pattern
        return cls(patterns, store=store, directory=directory)

    def reload_if_changed(self) -> bool:
        if self.directory is None:
            return False
        try:
            paths = _pattern_paths(self.directory)
            current = {str(path): path.stat().st_mtime_ns for path in paths}
        except OSError:
            self.reload()
            return True
        if current != self._mtimes:
            self.reload()
            return True
        return False

    def reload(self) -> int:
        if self.directory is None:
            return len(self.patterns)
        refreshed = CorrelationEngine.from_directory(self.directory, store=self.store)
        self.patterns = refreshed.patterns
        self._mtimes = refreshed._mtimes
        return len(self.patterns)

    def feed(self, event: dict[str, Any], matched_rule_ids: set[str]) -> list[dict[str, Any]]:
        """Advance every pattern with this event; return correlation alerts."""
        ts = parse_timestamp(event["timestamp"]).timestamp()
        fired: list[dict[str, Any]] = []
        for pattern in self.patterns.values():
            group_values = pattern.group_values(event)
            group = Pattern.storage_key(group_values)
            for index, stage in enumerate(pattern.stages):
                if not stage.matches(event, matched_rule_ids):
                    continue
                entries = self.store.entries(pattern.id, group, stage.id)
                entries.append([event["id"], ts])
                cutoff = ts - pattern.window_seconds
                entries = [item for item in entries if item[1] >= cutoff]
                self.store.set_entries(pattern.id, group, stage.id, entries)

                completions = self.store.completions(pattern.id, group)
                previous_ok = True
                if index > 0:
                    previous_ts = completions.get(pattern.stages[index - 1].id)
                    previous_ok = (
                        previous_ts is not None and ts - previous_ts <= pattern.window_seconds
                    )
                if previous_ok and len(entries) >= stage.min_events:
                    completions[stage.id] = ts
                    self.store.set_completions(pattern.id, group, completions)

            completions = self.store.completions(pattern.id, group)
            if len(completions) == len(pattern.stages):
                fired.append(
                    self._build_alert(pattern, event, group_values, ts, completions)
                )
                self.store.reset(pattern.id, group)
        return fired

    def _build_alert(
        self,
        pattern: Pattern,
        event: dict[str, Any],
        group_values: tuple[str, ...],
        ts: float,
        completions: dict[str, float],
    ) -> dict[str, Any]:
        stage_summaries: list[dict[str, Any]] = []
        total_events = 0
        for stage in pattern.stages:
            entries = self.store.entries(
                pattern.id, Pattern.storage_key(group_values), stage.id
            )
            total_events += len(entries)
            stage_summaries.append(
                {
                    "field": f"stage:{stage.id}",
                    "op": f"count>={stage.min_events}",
                    "expected": stage.min_events,
                    "actual": len(entries),
                    "completed_at": _iso(completions.get(stage.id, ts)),
                }
            )
        return {
            "kind": "correlation",
            "rule_id": pattern.id,
            "title": pattern.title,
            "description": pattern.description,
            "severity": pattern.severity,
            "mitre": list(pattern.mitre),
            "timestamp": event["timestamp"],
            "host": event.get("host", "-"),
            "user": event.get("user", "-"),
            "event_id": event["id"],
            "count": total_events,
            "matched_fields": stage_summaries,
            "false_positives": list(pattern.false_positives),
            "response": list(pattern.response),
            "group": dict(zip(pattern.group_by, group_values)),
            "window_seconds": pattern.window_seconds,
            "stages": [
                {"id": stage.id, "completed_at": _iso(completions.get(stage.id, ts))}
                for stage in pattern.stages
            ],
        }
