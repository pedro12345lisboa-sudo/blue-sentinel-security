#!/usr/bin/env python3
"""Validate the BLUE-SENTINEL rule library and measure its fixture hit-rate.

Usage
-----
    python scripts/development/validate_rules.py              # validate + hit-rate
    python scripts/development/validate_rules.py -v           # per-fixture detail
    python scripts/development/validate_rules.py --write-docs # refresh the ATT&CK matrix
    python scripts/development/validate_rules.py --check-docs # fail when the matrix is stale

Exit code is ``1`` when any check fails, so CI can simply run the script.

Why a bespoke validator instead of pySigma or a JSON Schema file?
-----------------------------------------------------------------
* **pySigma** validates Sigma syntax against the specification, which is a
  subset of what this library promises. It would not check the lab contract
  (``lab_id`` <-> file name parity, ``lab_samples`` that really fire,
  techniques that exist in the engine catalog, fixtures, hit-rate) and it
  would add a pinned dependency chain to CI. The rules stay plain Sigma YAML,
  so they can still be fed to pySigma/Sigma CLI later without rewriting.
* **JSON Schema** cannot express the cross-field rules that matter here:
  UUID uniqueness across *files*, ``file stem == lab_id``, ``tags`` membership
  in ``app.detection.mitre.TECHNIQUES``, or "this sample must actually match".
* Instead, structural/metadata checks are written out explicitly below (one
  readable file, no schema DSL to keep in sync) and the *syntax* check reuses
  the lab's own loaders (``load_sigma_rule`` / ``load_yara_rule`` /
  ``load_pattern``) - the exact code path the detection engine runs.

Scope is defensive-only: the script reads rules and synthetic fixtures, and
never executes, downloads or unpacks any sample.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[2]
BACKEND = REPO / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

try:
    import yaml
except ImportError as exc:  # pragma: no cover - CI installs PyYAML
    raise SystemExit("PyYAML is required to validate rules: pip install pyyaml") from exc

from app.collectors.normalizer import NormalizationError, normalize  # noqa: E402
from app.detection.correlation import PatternError, load_pattern  # noqa: E402
from app.detection.mitre import (  # noqa: E402
    TACTICS,
    TECHNIQUES,
    tactics_for,
)
from app.detection.severity import SEVERITIES, normalize as normalize_severity  # noqa: E402
from app.detection.sigma_loader import SigmaParseError, load_sigma_rule  # noqa: E402
from app.detection.yara_scanner import YaraError, load_yara_rule  # noqa: E402

# --- constants -------------------------------------------------------------

SIGMA_DIR = REPO / "rules" / "sigma"
YARA_DIR = REPO / "rules" / "yara"
PATTERN_DIR = REPO / "rules" / "patterns"
FIXTURE_DIR = REPO / "backend" / "tests" / "fixtures" / "detection"
COVERAGE_DOC = REPO / "docs" / "security" / "attack-coverage.md"

# Library contract from the brief: 20 Sigma rules + 5 YARA rules.
EXPECTED_SIGMA_RULES = 20
EXPECTED_YARA_RULES = 5
EXPECTED_AUTHOR = "Pedro Lisboa"

# Fields every published Sigma rule must carry (brief + lab loader needs).
SIGMA_REQUIRED = (
    "id",
    "title",
    "status",
    "description",
    "references",
    "author",
    "date",
    "logsource",
    "detection",
    "level",
    "falsepositives",
    "response",
    "tags",
    "lab_id",
    "lab_samples",
)

YARA_REQUIRED_META = (
    "id",
    "uuid",
    "description",
    "author",
    "date",
    "level",
    "mitre",
    "false_positive",
    "response",
)

SIGMA_STATUSES = frozenset(
    {"experimental", "test", "stable", "deprecated", "unsupported", "draft"}
)
KEBAB_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
TECHNIQUE_TAG_RE = re.compile(r"^attack\.t\d{4}(?:_\d{3})?$", re.IGNORECASE)
YARA_ID_RE = re.compile(r"^bs-yara-[a-z0-9]+(?:-[a-z0-9]+)*$")
DATE_RE = re.compile(r"^\d{4}/\d{2}/\d{2}$")
FIXTURE_KINDS = frozenset({"sigma", "yara"})

# Phrases that would make a "specific" false positive list meaningless.
PLACEHOLDER_FALSE_POSITIVES = frozenset(
    {"n/a", "na", "none", "unknown", "tbd", "todo", "-", "false positive", "no false positives"}
)
MIN_FP_LENGTH = 12

MATRIX_BEGIN = "<!-- BEGIN GENERATED: attack coverage matrix -->"
MATRIX_END = "<!-- END GENERATED: attack coverage matrix -->"


# --- reporting -------------------------------------------------------------


@dataclass
class Report:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def error(self, where: str, message: str) -> None:
        self.errors.append(f"{where}: {message}")

    def warn(self, where: str, message: str) -> None:
        self.warnings.append(f"{where}: {message}")

    @property
    def ok(self) -> bool:
        return not self.errors


def rel(path: Path) -> str:
    try:
        return path.relative_to(REPO).as_posix()
    except ValueError:
        return str(path)


# --- shared metadata checks ------------------------------------------------


def check_uuid(report: Report, where: str, raw: Any) -> str | None:
    """Return the canonical UUID string, recording an error when malformed."""
    if raw is None:
        report.error(where, "missing id/uuid")
        return None
    text = str(raw).strip()
    try:
        parsed = uuid.UUID(text)
    except ValueError:
        report.error(where, f"id {text!r} is not a valid UUID")
        return None
    if str(parsed) != text:
        report.error(where, f"id {text!r} is not in canonical (lowercase, hyphenated) form")
        return None
    return str(parsed)


def check_date(report: Report, where: str, raw: Any) -> None:
    text = str(raw or "")
    if not DATE_RE.match(text):
        report.error(where, f"date {text!r} must use YYYY/MM/DD")
        return
    try:
        datetime.strptime(text, "%Y/%m/%d")
    except ValueError:
        report.error(where, f"date {text!r} is not a real calendar date")


def check_author(report: Report, where: str, raw: Any) -> None:
    author = str(raw or "").strip()
    if not author:
        report.error(where, "author must not be empty")
    elif author != EXPECTED_AUTHOR:
        report.error(where, f"author {author!r} != library author {EXPECTED_AUTHOR!r}")


def check_false_positives(report: Report, where: str, raw: Any) -> None:
    """``falsepositives`` must exist and describe real, specific scenarios.

    Accepts a plain string (YARA ``meta`` style) or a list (Sigma style).
    """
    if isinstance(raw, str):
        raw = [raw]
    if not isinstance(raw, (list, tuple)) or not raw:
        report.error(where, "falsepositives must be a non-empty list")
        return
    for entry in raw:
        text = str(entry).strip()
        if len(text) < MIN_FP_LENGTH:
            report.error(
                where,
                f"false positive {text!r} is too short to be specific "
                f"(min {MIN_FP_LENGTH} characters)",
            )
        elif text.lower().strip(". ") in PLACEHOLDER_FALSE_POSITIVES:
            report.error(where, f"false positive {text!r} is a placeholder, describe the source")


def check_references(report: Report, where: str, raw: Any) -> None:
    if not isinstance(raw, list) or not raw:
        report.error(where, "references must be a non-empty list")
        return
    for entry in raw:
        text = str(entry).strip()
        if not text.startswith(("https://", "http://")):
            report.error(where, f"reference {text!r} is not a URL")


def check_response(report: Report, where: str, raw: Any) -> None:
    if isinstance(raw, str):
        raw = [raw]
    if not isinstance(raw, (list, tuple)) or not raw:
        report.error(where, "response must be a non-empty list (analyst playbook)")


def check_technique_tags(report: Report, where: str, tags: Any) -> tuple[str, ...]:
    """Return the technique ids referenced by ``tags`` (errors on unknown ones)."""
    if not isinstance(tags, list) or not tags:
        report.error(where, "tags must be a non-empty list with attack.tXXXX entries")
        return ()
    techniques: list[str] = []
    for tag in tags:
        text = str(tag)
        if not TECHNIQUE_TAG_RE.match(text):
            report.error(where, f"tag {text!r} is not an attack.tXXXX technique tag")
            continue
        match = re.match(r"^attack\.t(\d{4})(?:_(\d{3}))?$", text, re.IGNORECASE)
        assert match is not None
        technique = f"T{match.group(1)}"
        if match.group(2):
            technique = f"{technique}.{match.group(2)}"
        if technique not in TECHNIQUES:
            report.error(
                where,
                f"technique {technique} is not in the lab catalog - "
                "add it to backend/app/detection/mitre.py (TECHNIQUES + TECHNIQUE_TACTICS)",
            )
            continue
        if not tactics_for(technique):
            report.error(where, f"technique {technique} has no entry in TECHNIQUE_TACTICS")
        if technique not in techniques:
            techniques.append(technique)
    if not techniques:
        report.error(where, "tags carry no usable ATT&CK technique")
    return tuple(techniques)


def check_tactic_catalog(report: Report) -> None:
    """The tactic map must cover the catalog and use real ATT&CK tactic names."""
    from app.detection.mitre import TECHNIQUE_TACTICS

    for technique in TECHNIQUES:
        if technique not in TECHNIQUE_TACTICS:
            report.error("mitre", f"{technique} missing from TECHNIQUE_TACTICS")
    for technique, tactics in TECHNIQUE_TACTICS.items():
        if technique not in TECHNIQUES:
            report.error("mitre", f"TECHNIQUE_TACTICS lists unknown technique {technique}")
        for tactic in tactics:
            if tactic not in TACTICS:
                report.error("mitre", f"{technique} maps to unknown tactic {tactic!r}")
    unknown = set(TECHNIQUE_TACTICS) - set(TECHNIQUES)
    if unknown:  # pragma: no cover - covered by the loop above
        report.error("mitre", f"techniques with tactics but no title: {sorted(unknown)}")


# --- Sigma -----------------------------------------------------------------


def check_sigma_rules(report: Report) -> dict[str, Any]:
    """Validate every ``rules/sigma/**/*.yml`` file; return lab_id -> rule."""
    rules: dict[str, Any] = {}
    uuids: dict[str, str] = {}
    paths = sorted(SIGMA_DIR.rglob("*.yml")) + sorted(SIGMA_DIR.rglob("*.yaml"))
    if len(paths) != EXPECTED_SIGMA_RULES:
        report.error(
            "sigma", f"expected {EXPECTED_SIGMA_RULES} rules, found {len(paths)}"
        )

    for path in paths:
        where = rel(path)
        try:
            document = yaml.safe_load(path.read_text(encoding="utf-8"))
        except yaml.YAMLError as exc:
            report.error(where, f"invalid YAML: {exc}")
            continue
        if not isinstance(document, dict):
            report.error(where, "rule document must be a mapping")
            continue

        missing = [key for key in SIGMA_REQUIRED if key not in document]
        if missing:
            report.error(where, f"missing required field(s): {', '.join(missing)}")
            continue

        lab_id = str(document["lab_id"]).strip()
        if not KEBAB_RE.match(lab_id):
            report.error(where, f"lab_id {lab_id!r} must be kebab-case")
        if path.stem != lab_id:
            report.error(where, f"file name {path.stem!r} must equal lab_id {lab_id!r}")
        if lab_id in rules:
            report.error(where, f"duplicate lab_id {lab_id!r}")
        if not KEBAB_RE.match(path.stem):
            report.error(where, "file name must be kebab-case")

        parsed_uuid = check_uuid(report, where, document["id"])
        if parsed_uuid:
            if parsed_uuid in uuids:
                report.error(where, f"UUID already used by {uuids[parsed_uuid]}")
            else:
                uuids[parsed_uuid] = where

        status = str(document.get("status", "")).strip()
        if status not in SIGMA_STATUSES:
            report.error(where, f"status {status!r} not in {sorted(SIGMA_STATUSES)}")

        check_author(report, where, document.get("author"))
        check_date(report, where, document.get("date"))
        check_references(report, where, document.get("references"))
        check_false_positives(report, where, document.get("falsepositives"))
        check_response(report, where, document.get("response"))

        try:
            level = normalize_severity(document.get("level"))
        except Exception as exc:
            report.error(where, f"level: {exc}")
        else:
            if level not in SEVERITIES:  # pragma: no cover - normalize enforces this
                report.error(where, f"level {level!r} unknown")

        if not str(document.get("description", "")).strip():
            report.error(where, "description must not be empty")
        if not str(document.get("title", "")).strip():
            report.error(where, "title must not be empty")

        if not isinstance(document.get("logsource"), dict) or not document["logsource"]:
            report.error(where, "logsource must be a non-empty mapping")

        detection = document.get("detection")
        if not isinstance(detection, dict) or not detection:
            report.error(where, "detection must be a non-empty mapping")
        elif not str(detection.get("condition", "")).strip():
            report.error(where, "detection.condition must be a non-empty string")
        elif len([key for key in detection if key != "condition"]) < 1:
            report.error(where, "detection must declare at least one selection")

        check_technique_tags(report, where, document.get("tags"))

        # Syntax/semantics: compile the rule exactly as the engine will.
        try:
            rule = load_sigma_rule(path)
        except SigmaParseError as exc:
            report.error(where, f"engine rejected the rule: {exc}")
            continue

        for kind in ("match", "no_match"):
            samples = getattr(rule, f"samples_{kind}")
            if not samples:
                report.error(where, f"lab_samples.{kind} must not be empty")
        for sample in rule.samples_match:
            if not rule.match(sample)[0]:
                report.error(where, "a lab_samples.match event does not fire this rule")
        rules[lab_id] = rule

    return rules


# --- YARA ------------------------------------------------------------------


def check_yara_rules(report: Report) -> dict[str, Any]:
    """Validate every ``rules/yara/*.yar`` file; return rule name -> rule."""
    rules: dict[str, Any] = {}
    uuids: dict[str, str] = {}
    paths = sorted(YARA_DIR.glob("*.yar")) + sorted(YARA_DIR.glob("*.yara"))
    if len(paths) != EXPECTED_YARA_RULES:
        report.error("yara", f"expected {EXPECTED_YARA_RULES} rules, found {len(paths)}")

    for path in paths:
        where = rel(path)
        if not KEBAB_RE.match(path.stem):
            report.error(where, "file name must be kebab-case")

        try:
            rule = load_yara_rule(path)
        except YaraError as exc:
            report.error(where, f"engine rejected the rule: {exc}")
            continue

        missing = [key for key in YARA_REQUIRED_META if key not in rule.meta]
        if missing:
            report.error(where, f"missing meta field(s): {', '.join(missing)}")
        if rule.name in rules:
            report.error(where, f"duplicate YARA rule name {rule.name!r}")

        lab_id = str(rule.meta.get("id", ""))
        if not YARA_ID_RE.match(lab_id):
            report.error(where, f"meta.id {lab_id!r} must match bs-yara-<kebab-case>")

        parsed_uuid = check_uuid(report, where, rule.meta.get("uuid"))
        if parsed_uuid:
            if parsed_uuid in uuids:
                report.error(where, f"UUID already used by {uuids[parsed_uuid]}")
            else:
                uuids[parsed_uuid] = where

        if not str(rule.meta.get("description", "")).strip():
            report.error(where, "meta.description must not be empty")
        check_author(report, where, rule.meta.get("author"))
        check_date(report, where, rule.meta.get("date"))
        check_false_positives(report, where, rule.meta.get("false_positive"))
        check_response(report, where, rule.meta.get("response"))

        rules[rule.name] = rule

    return rules


# --- correlation patterns ---------------------------------------------------


def check_patterns(report: Report) -> dict[str, Any]:
    """Compile ``rules/patterns/*.yaml`` with the engine's own loader."""
    patterns: dict[str, Any] = {}
    for path in sorted(PATTERN_DIR.glob("*.yaml")) + sorted(PATTERN_DIR.glob("*.yml")):
        where = rel(path)
        try:
            pattern = load_pattern(path)
        except PatternError as exc:
            report.error(where, f"engine rejected the pattern: {exc}")
            continue
        if pattern.id in patterns:
            report.error(where, f"duplicate pattern id {pattern.id!r}")
        check_false_positives(report, where, pattern.false_positives)
        check_response(report, where, pattern.response)
        if not pattern.mitre:
            report.error(where, "pattern declares no MITRE technique")
        patterns[pattern.id] = pattern
    return patterns


# --- fixtures ---------------------------------------------------------------


@dataclass
class Fixture:
    path: Path
    name: str  # rule id (sigma lab_id or yara rule name)
    kind: str
    event: dict[str, Any]
    expect: tuple[str, ...]

    @property
    def is_positive(self) -> bool:
        return bool(self.expect)


def _load_fixture(report: Report, path: Path, positive: bool) -> Fixture | None:
    where = rel(path)
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        report.error(where, f"unreadable fixture: {exc}")
        return None
    if not isinstance(payload, dict):
        report.error(where, "fixture must be a JSON object")
        return None

    name = path.stem
    for key in ("event", "rule", "kind"):
        if key not in payload:
            report.error(where, f"missing key {key!r}")
            return None
    if str(payload["rule"]) != name:
        report.error(where, f"rule {payload['rule']!r} must match the file name {name!r}")
    kind = str(payload["kind"])
    if kind not in FIXTURE_KINDS:
        report.error(where, f"kind {kind!r} must be one of {sorted(FIXTURE_KINDS)}")

    expect: tuple[str, ...] = ()
    if positive:
        raw_expect = payload.get("expect")
        if not isinstance(raw_expect, list) or not raw_expect:
            report.error(where, "positive fixture must declare a non-empty 'expect' list")
        else:
            expect = tuple(str(item) for item in raw_expect)
            if name not in expect:
                report.error(where, f"'expect' must include the fixture's own rule {name!r}")

    if not isinstance(payload.get("event"), dict):
        report.error(where, "event must be a mapping")
        return None
    try:
        normalize(payload["event"], name)
    except NormalizationError as exc:
        report.error(where, f"event does not normalise: {exc}")
        return None

    if not str(payload.get("description", "")).strip():
        report.warn(where, "fixture has no description")

    return Fixture(path=path, name=name, kind=kind, event=payload["event"], expect=expect)


def check_fixtures(
    report: Report, sigma_rules: dict[str, Any], yara_rules: dict[str, Any]
) -> tuple[list[Fixture], list[Fixture]]:
    """Every rule needs exactly one positive and one negative fixture."""
    expected = set(sigma_rules) | set(yara_rules)
    kind_of = {name: "sigma" for name in sigma_rules}
    kind_of.update({name: "yara" for name in yara_rules})

    positives: list[Fixture] = []
    negatives: list[Fixture] = []
    for folder, bucket in (("positive", positives), ("negative", negatives)):
        directory = FIXTURE_DIR / folder
        if not directory.is_dir():
            report.error(rel(directory), "fixture directory is missing")
            continue
        found = {path.stem for path in directory.glob("*.json")}
        for missing in sorted(expected - found):
            report.error(rel(directory), f"missing {folder} fixture for rule {missing!r}")
        for extra in sorted(found - expected):
            report.error(rel(directory / f"{extra}.json"), "fixture does not correspond to any rule")
        for path in sorted(directory.glob("*.json")):
            fixture = _load_fixture(report, path, positive=(folder == "positive"))
            if fixture is None:
                continue
            if fixture.name in kind_of and fixture.kind != kind_of[fixture.name]:
                report.error(rel(path), f"kind {fixture.kind!r} != rule kind {kind_of[fixture.name]!r}")
            bucket.append(fixture)

    return positives, negatives


# --- hit-rate ---------------------------------------------------------------


def fired_rules(
    sigma_rules: dict[str, Any], yara_rules: dict[str, Any], fixture: Fixture
) -> set[str]:
    """Rule ids that fire for a fixture event (Sigma matches + YARA text scan)."""
    event = normalize(fixture.event, fixture.name)
    hits = {name for name, rule in sigma_rules.items() if rule.match(event)[0]}
    text = str(event.get("text", ""))
    if text:
        hits |= {name for name, rule in yara_rules.items() if rule.scan(text)[0]}
    return hits


def measure_hit_rate(
    report: Report,
    sigma_rules: dict[str, Any],
    yara_rules: dict[str, Any],
    positives: list[Fixture],
    negatives: list[Fixture],
    verbose: bool = False,
) -> tuple[int, int]:
    """Return (correct, total) and record an error for every wrong verdict."""
    correct = 0
    total = 0
    lines: list[str] = []

    for fixture in positives:
        total += 1
        try:
            hits = fired_rules(sigma_rules, yara_rules, fixture)
        except NormalizationError as exc:
            report.error(rel(fixture.path), f"event does not normalise: {exc}")
            continue
        expected = set(fixture.expect)
        if hits == expected:
            correct += 1
            lines.append(f"  PASS  {fixture.name:<34} positive -> {sorted(hits)}")
        else:
            report.error(
                rel(fixture.path),
                f"expected exactly {sorted(expected)}, fired {sorted(hits)}",
            )
            lines.append(f"  FAIL  {fixture.name:<34} positive -> {sorted(hits)}")

    for fixture in negatives:
        total += 1
        try:
            hits = fired_rules(sigma_rules, yara_rules, fixture)
        except NormalizationError as exc:
            report.error(rel(fixture.path), f"event does not normalise: {exc}")
            continue
        if not hits:
            correct += 1
            lines.append(f"  PASS  {fixture.name:<34} negative -> (none)")
        else:
            report.error(rel(fixture.path), f"negative fixture fired {sorted(hits)}")
            lines.append(f"  FAIL  {fixture.name:<34} negative -> {sorted(hits)}")

    if verbose:
        for line in lines:
            print(line)
    return correct, total


# --- ATT&CK coverage matrix -------------------------------------------------


def build_coverage(sigma_rules: dict[str, Any], yara_rules: dict[str, Any], patterns: dict[str, Any]) -> str:
    """Render the generated block for ``docs/security/attack-coverage.md``."""
    coverage: dict[str, dict[str, list[str]]] = {}
    for lab_id, rule in sigma_rules.items():
        for technique in rule.mitre:
            coverage.setdefault(technique, {}).setdefault("Sigma", []).append(f"`{lab_id}`")
    for name, rule in yara_rules.items():
        for technique in rule.mitre:
            coverage.setdefault(technique, {}).setdefault("YARA", []).append(f"`{name}`")
    for pattern_id, pattern in patterns.items():
        for technique in pattern.mitre:
            coverage.setdefault(technique, {}).setdefault("Correlation", []).append(f"`{pattern_id}`")

    rows: list[str] = []
    covered_tactics: set[str] = set()
    for tactic in TACTICS:
        techniques = [t for t in TECHNIQUES if t in coverage and tactic in tactics_for(t)]
        for technique in techniques:
            covered_tactics.add(tactic)
            kinds = coverage[technique]
            rules = [rule for kind in ("Sigma", "YARA", "Correlation") for rule in kinds.get(kind, [])]
            rows.append(
                f"| {tactic} | `{technique}` | {TECHNIQUES[technique]} | {', '.join(rules)} |"
            )

    uncovered = [tactic for tactic in TACTICS if tactic not in covered_tactics]
    technique_count = len(coverage)
    rule_count = len(sigma_rules) + len(yara_rules) + len(patterns)

    lines = [
        MATRIX_BEGIN,
        "",
        "| Tactic | Technique | ATT&CK name | Coverage (rule ids) |",
        "|---|---|---|---|",
        *rows,
        "",
        f"**Coverage summary:** {rule_count} rules "
        f"({len(sigma_rules)} Sigma + {len(yara_rules)} YARA + {len(patterns)} correlation) "
        f"across **{technique_count} techniques** in "
        f"**{len(covered_tactics)} of {len(TACTICS)} tactics**.",
        "",
        "**Tactics with no coverage:** "
        + (", ".join(f"*{t}*" for t in uncovered) if uncovered else "none")
        + ".",
        "",
        "> Generated by `python scripts/development/validate_rules.py --write-docs`.",
        "> Do not edit this block by hand - edit the rules (or the generator) instead.",
        "",
        MATRIX_END,
    ]
    return "\n".join(lines)


def _block_from_doc(report: Report) -> str | None:
    if not COVERAGE_DOC.is_file():
        report.error(rel(COVERAGE_DOC), "coverage document is missing")
        return None
    text = COVERAGE_DOC.read_text(encoding="utf-8")
    if MATRIX_BEGIN not in text or MATRIX_END not in text:
        report.error(rel(COVERAGE_DOC), f"missing {MATRIX_BEGIN} / {MATRIX_END} markers")
        return None
    start = text.index(MATRIX_BEGIN)
    end = text.index(MATRIX_END) + len(MATRIX_END)
    return text[start:end]


def sync_docs(report: Report, sigma_rules: dict[str, Any], yara_rules: dict[str, Any],
              patterns: dict[str, Any], *, write: bool) -> None:
    """Refresh (``--write-docs``) or verify (``--check-docs``) the matrix block."""
    generated = build_coverage(sigma_rules, yara_rules, patterns)
    if write:
        text = COVERAGE_DOC.read_text(encoding="utf-8")
        if MATRIX_BEGIN not in text or MATRIX_END not in text:
            report.error(rel(COVERAGE_DOC), f"missing {MATRIX_BEGIN} / {MATRIX_END} markers")
            return
        start = text.index(MATRIX_BEGIN)
        end = text.index(MATRIX_END) + len(MATRIX_END)
        COVERAGE_DOC.write_text(text[:start] + generated + text[end:], encoding="utf-8")
        print(f"updated {rel(COVERAGE_DOC)}")
        return

    current = _block_from_doc(report)
    if current is None:
        return
    if current.strip() != generated.strip():
        report.error(
            rel(COVERAGE_DOC),
            "ATT&CK matrix is stale - run "
            "`python scripts/development/validate_rules.py --write-docs`",
        )


# --- main -------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("-v", "--verbose", action="store_true", help="print every fixture verdict")
    parser.add_argument(
        "--write-docs",
        action="store_true",
        help="regenerate the ATT&CK matrix inside docs/security/attack-coverage.md",
    )
    parser.add_argument(
        "--check-docs",
        action="store_true",
        help="fail when the generated ATT&CK matrix is stale (default when neither flag is given)",
    )
    args = parser.parse_args(argv)
    check_docs = args.check_docs or not args.write_docs

    report = Report()

    print("== Sigma rules ==")
    sigma_rules = check_sigma_rules(report)
    print(f"   {len(sigma_rules)} rules loaded, {len({r.uuid for r in sigma_rules.values()})} UUIDs")

    print("== YARA rules ==")
    yara_rules = check_yara_rules(report)
    print(f"   {len(yara_rules)} rules loaded")

    print("== Correlation patterns ==")
    patterns = check_patterns(report)
    print(f"   {len(patterns)} patterns loaded")

    check_tactic_catalog(report)

    print("== Fixtures ==")
    positives, negatives = check_fixtures(report, sigma_rules, yara_rules)
    correct, total = measure_hit_rate(
        report, sigma_rules, yara_rules, positives, negatives, verbose=args.verbose
    )
    rate = (100.0 * correct / total) if total else 0.0
    print(f"   hit-rate: {correct}/{total} fixtures correct ({rate:.1f}%)")
    if total and correct != total:
        report.error("fixtures", f"{total - correct} fixture(s) produced the wrong verdict")

    print("== MITRE ATT&CK coverage ==")
    techniques = sorted({t for rule in sigma_rules.values() for t in rule.mitre}
                        | {t for rule in yara_rules.values() for t in rule.mitre}
                        | {t for pattern in patterns.values() for t in pattern.mitre})
    covered = {tactic for tactic in TACTICS if any(tactic in tactics_for(t) for t in techniques)}
    print(f"   {len(techniques)} techniques across {len(covered)}/{len(TACTICS)} tactics")
    uncovered = [tactic for tactic in TACTICS if tactic not in covered]
    if uncovered:
        print(f"   uncovered: {', '.join(uncovered)}")

    if not args.write_docs:
        if check_docs:
            sync_docs(report, sigma_rules, yara_rules, patterns, write=False)
    elif report.ok:
        sync_docs(report, sigma_rules, yara_rules, patterns, write=True)
    else:
        report.error("docs", "refusing to regenerate the matrix while validation fails")

    for warning in report.warnings:
        print(f"WARNING {warning}")
    if report.errors:
        print(f"\n{len(report.errors)} problem(s) found:")
        for error in report.errors:
            print(f"  - {error}")
        return 1
    print("\nOK: rule library is valid.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
