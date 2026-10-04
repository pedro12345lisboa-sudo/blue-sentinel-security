"""Sigma rule loader and evaluator for the BLUE-SENTINEL detection lab.

Why an internal subset instead of pySigma?
-------------------------------------------
* The lab and its tests must run offline in CI and locally with only the
  standard library plus PyYAML (pySigma adds a dependency chain that has to
  be pinned and kept in sync with every rule change).
* The subset covers everything the published lab rules need: ``logsource``,
  ``detection`` selections with field modifiers, boolean ``condition``
  expressions (including ``N of them`` / globs) and ``level`` - small enough
  to audit for correctness and ReDoS safety.
* Rules stay standard Sigma YAML, so they can be fed to pySigma or Sigma CLI
  later without rewriting them.

Supported field modifiers: ``contains``, ``startswith``, ``endswith``,
``re``, ``all``, ``in``, ``notin``, ``cidr``, ``gte``, ``lte``, ``gt``,
``lt`` and the case-insensitive flag ``i`` (combinable, e.g. ``|contains|i``).
Unsupported constructs (backends/pipes, nested maps, aggregations) raise
``SigmaError`` at load time instead of being silently ignored.

Rule identity: the document ``id`` is the Sigma UUID, while the lab keys
alerts, scenarios and correlation patterns on ``lab_id`` (stable kebab-case
handle, e.g. ``bs-auth-failed-logons``). Rules without ``lab_id`` fall back
to ``id``; uniqueness is enforced on the key used by the lab.

Regex safety: every ``re`` pattern is length-capped and scanned for nested
quantifiers at load time (``redos_risk``), and each evaluation is measured;
the engine records per-rule timings so slow rules surface in tests/stats.
"""

from __future__ import annotations

import fnmatch
import ipaddress
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from app.collectors.normalizer import normalize as normalize_event, sigma_view
from app.detection.mitre import TECHNIQUES, from_sigma_tags
from app.detection.severity import SeverityError, normalize as normalize_severity

# --- errors ----------------------------------------------------------------


class SigmaError(ValueError):
    """A rule could not be loaded or evaluated."""


class SigmaParseError(SigmaError):
    """A rule document contains a syntax or schema error."""


# --- constants -------------------------------------------------------------

# Rule logsource categories mapped onto the lab's event categories.
LOGSOURCE_CATEGORY_MAP: dict[str, frozenset[str]] = {
    "authentication_failure": frozenset({"auth"}),
    "authentication_success": frozenset({"auth"}),
    "process_creation": frozenset({"process"}),
    "network_connection": frozenset({"network"}),
    "file_event": frozenset({"file"}),
    "web_access": frozenset({"web"}),
}

_VALUE_MODIFIERS = frozenset(
    {"re", "contains", "startswith", "endswith", "gte", "lte", "gt", "lt", "in", "notin", "cidr"}
)
_FLAG_MODIFIERS = frozenset({"i", "all"})
_KNOWN_MODIFIERS = _VALUE_MODIFIERS | _FLAG_MODIFIERS
_CONDITION_KEYWORDS = frozenset({"and", "or", "not", "of", "them", "all", "any"})

_MAX_REGEX_LENGTH = 500
_MAX_SCAN_LENGTH = 8192
# Soft per-rule budget; the engine measures and reports overruns.
RULE_TIMEOUT_S = 0.05

_REQUIRED_FIELDS = ("title", "id", "description", "logsource", "detection", "level")

_QUANTIFIED_GROUP = re.compile(r"\((?:[^()\\]|\\.)*[*+](?:[^()\\]|\\.)*\)\s*[*+]")


def redos_risk(pattern: str) -> str | None:
    """Return a reason string when ``pattern`` looks unsafe, else None.

    Heuristic focused on the classic nested-quantifier form ``(a+)+`` that
    causes catastrophic backtracking. Input scanned with the pattern is
    additionally truncated to ``_MAX_SCAN_LENGTH`` characters.
    """
    if len(pattern) > _MAX_REGEX_LENGTH:
        return f"pattern longer than {_MAX_REGEX_LENGTH} characters"
    if _QUANTIFIED_GROUP.search(pattern):
        return "quantified group that itself contains a quantifier (nested quantifier)"
    return None


# --- value comparisons -----------------------------------------------------


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in ("true", "1", "yes")
    return bool(value)


def _equals(actual: Any, expected: Any, ci: bool) -> bool:
    if isinstance(expected, bool) or isinstance(actual, bool):
        return _as_bool(actual) == bool(expected)
    left, right = str(actual), str(expected)
    return left.lower() == right.lower() if ci else left == right


def _match_affix(actual: Any, expected: Any, kind: str, ci: bool) -> bool:
    text, needle = str(actual), str(expected)
    if ci:
        text, needle = text.lower(), needle.lower()
    if kind == "contains":
        return needle in text
    if kind == "startswith":
        return text.startswith(needle)
    return text.endswith(needle)


def _match_regex(actual: Any, expected: Any, ci: bool) -> bool:
    flags = re.IGNORECASE if ci else 0
    try:
        return re.search(str(expected), str(actual)[:_MAX_SCAN_LENGTH], flags) is not None
    except re.error:  # pragma: no cover - patterns are compiled at load time
        return False


def _match_numeric(actual: Any, expected: Any, kind: str) -> bool:
    try:
        left, right = float(actual), float(expected)
    except (TypeError, ValueError):
        return False
    if kind == "gte":
        return left >= right
    if kind == "lte":
        return left <= right
    if kind == "gt":
        return left > right
    return left < right


def _match_cidr(actual: Any, expected: Any) -> bool:
    try:
        address = ipaddress.ip_address(str(actual).strip())
        network = ipaddress.ip_network(str(expected).strip(), strict=False)
    except ValueError:
        return False
    return address in network


# --- compiled field conditions --------------------------------------------


@dataclass(frozen=True)
class FieldCondition:
    """One ``field|modifiers: value`` entry of a Sigma selection."""

    field: str
    modifiers: tuple[str, ...]
    expected: Any

    @property
    def primary(self) -> str:
        for modifier in self.modifiers:
            if modifier not in _FLAG_MODIFIERS:
                return modifier
        return "eq"

    @property
    def op(self) -> str:
        return "|".join(self.modifiers) if self.modifiers else "eq"

    def evaluate(self, view: dict[str, Any]) -> tuple[bool, dict[str, Any] | None]:
        """Return (matched, binding) where binding explains a true comparison."""
        if self.field not in view:
            return False, None
        actual = view[self.field]
        primary = self.primary

        if primary in ("in", "notin"):
            return self._evaluate_membership(actual)

        ci = "i" in self.modifiers
        expected_items = list(self.expected) if isinstance(self.expected, list) else [self.expected]
        actual_items = list(actual) if isinstance(actual, list) else [actual]
        pairs = [(a, e) for a in actual_items for e in expected_items]
        if not pairs:
            return False, None

        want_all = "all" in self.modifiers
        results = [(a, e, self._scalar_match(a, e)) for a, e in pairs]
        if want_all:
            ok = all(matched for _, _, matched in results)
            chosen = results[0]
        else:
            first = next((item for item in results if item[2]), None)
            ok = first is not None
            chosen = first
        if not ok:
            return False, None
        used_actual, used_expected, _ = chosen
        return True, {
            "field": self.field,
            "op": self.op,
            "expected": used_expected,
            "actual": used_actual,
        }

    def _evaluate_membership(self, actual: Any) -> tuple[bool, dict[str, Any] | None]:
        ci = "i" in self.modifiers
        items = list(actual) if isinstance(actual, list) else [actual]
        expected_list = list(self.expected)
        if self.primary == "in":
            ok = any(_equals(a, e, ci) for a in items for e in expected_list)
        else:  # notin
            ok = all(not _equals(a, e, ci) for a in items for e in expected_list)
        if not ok:
            return False, None
        return True, {
            "field": self.field,
            "op": self.op,
            "expected": expected_list,
            "actual": actual,
        }

    def _scalar_match(self, actual: Any, expected: Any) -> bool:
        primary = self.primary
        ci = "i" in self.modifiers
        if primary == "re":
            return _match_regex(actual, expected, ci)
        if primary in ("contains", "startswith", "endswith"):
            return _match_affix(actual, expected, primary, ci)
        if primary in ("gte", "lte", "gt", "lt"):
            return _match_numeric(actual, expected, primary)
        if primary == "cidr":
            return _match_cidr(actual, expected)
        return _equals(actual, expected, ci)


# --- condition AST ---------------------------------------------------------

Bindings = list[dict[str, Any]]


class _Node:
    def evaluate(self, sels: dict[str, tuple[bool, Bindings]]) -> tuple[bool, Bindings]:
        raise NotImplementedError


@dataclass(frozen=True)
class _Leaf(_Node):
    name: str

    def evaluate(self, sels: dict[str, tuple[bool, Bindings]]) -> tuple[bool, Bindings]:
        ok, bindings = sels[self.name]
        return ok, list(bindings)


@dataclass(frozen=True)
class _Not(_Node):
    child: _Node

    def evaluate(self, sels: dict[str, tuple[bool, Bindings]]) -> tuple[bool, Bindings]:
        ok, _ = self.child.evaluate(sels)
        return (not ok), []


@dataclass(frozen=True)
class _And(_Node):
    children: tuple[_Node, ...]

    def evaluate(self, sels: dict[str, tuple[bool, Bindings]]) -> tuple[bool, Bindings]:
        results = [child.evaluate(sels) for child in self.children]
        ok = all(item[0] for item in results)
        bindings: Bindings = [binding for item in results if item[0] for binding in item[1]]
        return ok, bindings


@dataclass(frozen=True)
class _Or(_Node):
    children: tuple[_Node, ...]

    def evaluate(self, sels: dict[str, tuple[bool, Bindings]]) -> tuple[bool, Bindings]:
        results = [child.evaluate(sels) for child in self.children]
        ok = any(item[0] for item in results)
        bindings: Bindings = [binding for item in results if item[0] for binding in item[1]]
        return ok, bindings


@dataclass(frozen=True)
class _Of(_Node):
    names: tuple[str, ...]
    spec: int | str  # int (minimum count), "all" or "any"

    def evaluate(self, sels: dict[str, tuple[bool, Bindings]]) -> tuple[bool, Bindings]:
        results = [sels[name] for name in self.names]
        count = sum(1 for ok, _ in results if ok)
        if self.spec == "all":
            ok = count == len(results)
        elif self.spec == "any":
            ok = count > 0
        else:
            ok = count >= int(self.spec)
        bindings: Bindings = [binding for item_ok, item in results if item_ok for binding in item]
        return ok, bindings


_TOKEN_RE = re.compile(r"\s*(\(|\)|\d+|[A-Za-z_][A-Za-z0-9_.\-*]*)")


def _tokenize(condition: str, where: str) -> list[str]:
    tokens: list[str] = []
    position = 0
    while position < len(condition):
        match = _TOKEN_RE.match(condition, position)
        if match is None:
            if condition[position:].strip() == "":
                break
            raise SigmaParseError(
                f"{where}: cannot tokenize condition near {condition[position:position + 24]!r}"
            )
        tokens.append(match.group(1))
        position = match.end()
    return tokens


class _ConditionParser:
    def __init__(self, tokens: list[str], selection_names: tuple[str, ...], where: str) -> None:
        self.tokens = tokens
        self.position = 0
        self.names = selection_names
        self.where = where

    def parse(self) -> _Node:
        if not self.tokens:
            raise SigmaParseError(f"{self.where}: empty condition")
        node = self._parse_or()
        if self.position != len(self.tokens):
            raise SigmaParseError(
                f"{self.where}: unexpected token {self.tokens[self.position]!r} in condition"
            )
        return node

    # -- grammar levels ----------------------------------------------------
    def _parse_or(self) -> _Node:
        nodes = [self._parse_and()]
        while self._peek_kw("or"):
            self._advance()
            nodes.append(self._parse_and())
        return nodes[0] if len(nodes) == 1 else _Or(tuple(nodes))

    def _parse_and(self) -> _Node:
        nodes = [self._parse_not()]
        while self._peek_kw("and"):
            self._advance()
            nodes.append(self._parse_not())
        return nodes[0] if len(nodes) == 1 else _And(tuple(nodes))

    def _parse_not(self) -> _Node:
        if self._peek_kw("not"):
            self._advance()
            return _Not(self._parse_not())
        return self._parse_primary()

    def _parse_primary(self) -> _Node:
        token = self._advance()
        if token == "(":
            node = self._parse_or()
            closing = self._advance()
            if closing != ")":
                raise SigmaParseError(f"{self.where}: expected ')' in condition, got {closing!r}")
            return node
        lowered = token.lower()
        if lowered in ("all", "any") or token.isdigit():
            if not self._peek_kw("of"):
                raise SigmaParseError(f"{self.where}: expected 'of' after {token!r} in condition")
            self._advance()
            target = self._advance()
            spec: int | str = int(token) if token.isdigit() else lowered
            return _Of(self._resolve(target), spec)
        if token not in self.names:
            raise SigmaParseError(f"{self.where}: unknown selection {token!r} in condition")
        return _Leaf(token)

    def _resolve(self, target: str) -> tuple[str, ...]:
        if target.lower() == "them":
            names = list(self.names)
        elif "*" in target or "?" in target:
            names = [name for name in self.names if fnmatch.fnmatchcase(name, target)]
        elif target in self.names:
            names = [target]
        else:
            raise SigmaParseError(f"{self.where}: condition references unknown selection {target!r}")
        if not names:
            raise SigmaParseError(f"{self.where}: condition pattern {target!r} matches no selection")
        return tuple(names)

    # -- helpers -----------------------------------------------------------
    def _peek_kw(self, keyword: str) -> bool:
        return (
            self.position < len(self.tokens)
            and self.tokens[self.position].lower() == keyword
        )

    def _peek(self) -> str | None:
        return self.tokens[self.position] if self.position < len(self.tokens) else None

    def _advance(self) -> str:
        token = self._peek()
        if token is None:
            raise SigmaParseError(f"{self.where}: condition ended unexpectedly")
        self.position += 1
        return token


def _parse_condition(
    condition: str, selection_names: tuple[str, ...], where: str
) -> _Node:
    return _ConditionParser(_tokenize(condition, where), selection_names, where).parse()


# --- selection compilation -------------------------------------------------


def _compile_selection(
    name: str, value: Any, where: str
) -> tuple[FieldCondition, ...]:
    if name in _CONDITION_KEYWORDS:
        raise SigmaParseError(f"{where}: selection name {name!r} is a reserved keyword")
    if not isinstance(value, dict) or not value:
        raise SigmaParseError(f"{where}: selection {name!r} must be a non-empty mapping")
    conditions: list[FieldCondition] = []
    for raw_field, expected in value.items():
        if not isinstance(raw_field, str) or not raw_field:
            raise SigmaParseError(f"{where}: selection {name!r} has a non-string field key")
        parts = raw_field.split("|")
        field_name, modifiers = parts[0], tuple(parts[1:])
        if not field_name:
            raise SigmaParseError(f"{where}: empty field name in selection {name!r}")
        unknown = [m for m in modifiers if m not in _KNOWN_MODIFIERS]
        if unknown:
            raise SigmaParseError(
                f"{where}: unknown modifier(s) {', '.join(unknown)} on field {field_name!r}"
            )
        _validate_expected(field_name, modifiers, expected, where)
        conditions.append(FieldCondition(field_name, modifiers, expected))
    return tuple(conditions)


def _validate_expected(field: str, modifiers: tuple[str, ...], expected: Any, where: str) -> None:
    primary = next((m for m in modifiers if m not in _FLAG_MODIFIERS), "eq")

    if primary == "in" or primary == "notin":
        if not isinstance(expected, list) or not expected:
            raise SigmaParseError(f"{where}: {field}|{primary} expects a non-empty list")
    elif primary == "cidr":
        if not isinstance(expected, str):
            raise SigmaParseError(f"{where}: {field}|cidr expects a CIDR string")
        try:
            ipaddress.ip_network(expected, strict=False)
        except ValueError as exc:
            raise SigmaParseError(f"{where}: {field}|cidr has invalid network {expected!r}: {exc}") from exc
    elif primary == "re":
        if not isinstance(expected, str):
            raise SigmaParseError(f"{where}: {field}|re expects a string pattern")
        risk = redos_risk(expected)
        if risk:
            raise SigmaParseError(f"{where}: {field}|re rejected ({risk})")
        try:
            re.compile(expected)
        except re.error as exc:
            raise SigmaParseError(f"{where}: {field}|re is not a valid regex: {exc}") from exc
    elif primary in ("gte", "lte", "gt", "lt"):
        if isinstance(expected, bool) or not isinstance(expected, (int, float, str)):
            raise SigmaParseError(f"{where}: {field}|{primary} expects a number")
        if isinstance(expected, str):
            try:
                float(expected)
            except ValueError as exc:
                raise SigmaParseError(f"{where}: {field}|{primary} expects a number") from exc
    else:
        _validate_scalar(expected, field, where)


def _validate_scalar(expected: Any, field: str, where: str) -> None:
    if isinstance(expected, list):
        if not expected:
            raise SigmaParseError(f"{where}: field {field!r} has an empty value list")
        for item in expected:
            _validate_scalar(item, field, where)
        return
    if isinstance(expected, dict):
        raise SigmaParseError(
            f"{where}: nested maps are not supported in the lab Sigma subset (field {field!r})"
        )
    if expected is None or isinstance(expected, (str, int, float, bool)):
        return
    raise SigmaParseError(f"{where}: unsupported value type for field {field!r}")


# --- rule document ---------------------------------------------------------


def _string_list(value: Any, where: str, key: str) -> tuple[str, ...]:
    if value is None:
        return ()
    if isinstance(value, str):
        return (value,)
    if isinstance(value, list) and all(isinstance(item, str) for item in value):
        return tuple(value)
    raise SigmaParseError(f"{where}: {key} must be a string or a list of strings")


def _normalize_samples(raw: Any, where: str, kind: str) -> tuple[dict[str, Any], ...]:
    if not isinstance(raw, list) or not raw:
        raise SigmaParseError(f"{where}: lab_samples.{kind} must be a non-empty list")
    events: list[dict[str, Any]] = []
    for index, record in enumerate(raw):
        if not isinstance(record, dict):
            raise SigmaParseError(f"{where}: lab_samples.{kind}[{index}] must be a mapping")
        try:
            events.append(normalize_event(record, f"{kind}-{index}"))
        except Exception as exc:  # NormalizationError/ValueError
            raise SigmaParseError(
                f"{where}: lab_samples.{kind}[{index}] is not a valid event: {exc}"
            ) from exc
    return tuple(events)


@dataclass(frozen=True)
class SigmaRule:
    """A loaded, compiled Sigma rule."""

    id: str  # lab handle (lab_id, falls back to the document id)
    uuid: str  # Sigma document id (validated as a UUID by validate_rules.py)
    title: str
    description: str
    level: str
    mitre: tuple[str, ...]
    false_positives: tuple[str, ...]
    response: tuple[str, ...]
    product: str | None
    category: str | None
    service: str | None
    source: str
    condition_text: str
    selections: dict[str, tuple[FieldCondition, ...]]
    node: _Node
    samples_match: tuple[dict[str, Any], ...]
    samples_no_match: tuple[dict[str, Any], ...]
    mtime_ns: int

    def matches_logsource(self, event: dict[str, Any]) -> bool:
        if self.product and str(event.get("product", "")).lower() != self.product:
            return False
        if self.category and event.get("category") not in LOGSOURCE_CATEGORY_MAP[self.category]:
            return False
        return True

    def match(self, event: dict[str, Any]) -> tuple[bool, Bindings]:
        """Evaluate the rule against a normalised event.

        Returns ``(matched, bindings)`` where ``bindings`` lists the field
        comparisons that evaluated to true (used by the educational panel).
        """
        if not self.matches_logsource(event):
            return False, []
        view = sigma_view(event)
        evaluated: dict[str, tuple[bool, Bindings]] = {}
        for name, conditions in self.selections.items():
            ok = True
            collected: Bindings = []
            for condition in conditions:
                matched, binding = condition.evaluate(view)
                if matched and binding is not None:
                    collected.append(binding)
                if not matched:
                    ok = False
            evaluated[name] = (ok, collected)
        return self.node.evaluate(evaluated)


def _mitre_tags(document: dict[str, Any], where: str) -> tuple[str, ...]:
    """Technique ids from Sigma tags, restricted to the lab catalog."""
    tags = from_sigma_tags(document.get("tags"))
    for technique in tags:
        if technique not in TECHNIQUES:
            raise SigmaParseError(
                f"{where}: MITRE technique {technique!r} is not in the lab catalog "
                "(add it to app/detection/mitre.py)"
            )
    return tags


def load_sigma_rule(path: Path) -> SigmaRule:
    """Load and compile a single Sigma rule file."""
    where = str(path)
    try:
        document = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise SigmaParseError(f"{where}: invalid YAML: {exc}") from exc
    if not isinstance(document, dict):
        raise SigmaParseError(f"{where}: rule document must be a mapping")

    missing = [key for key in _REQUIRED_FIELDS if key not in document]
    if missing:
        raise SigmaParseError(f"{where}: missing required field(s): {', '.join(missing)}")

    rule_id = str(document["id"]).strip()
    if not rule_id:
        raise SigmaParseError(f"{where}: id must not be empty")
    # ``id`` is the Sigma UUID; ``lab_id`` is the stable kebab-case handle used
    # by scenarios, correlation patterns and the UI. Rules without ``lab_id``
    # (snippets written inside tests) fall back to ``id``.
    lab_id = str(document.get("lab_id") or "").strip() or rule_id
    if not lab_id:
        raise SigmaParseError(f"{where}: lab_id must not be empty")

    try:
        level = normalize_severity(document["level"])
    except SeverityError as exc:
        raise SigmaParseError(f"{where}: {exc}") from exc

    logsource = document["logsource"]
    if not isinstance(logsource, dict):
        raise SigmaParseError(f"{where}: logsource must be a mapping")
    product = logsource.get("product")
    category = logsource.get("category")
    service = logsource.get("service")
    if product is not None and not isinstance(product, str):
        raise SigmaParseError(f"{where}: logsource.product must be a string")
    if service is not None and not isinstance(service, str):
        raise SigmaParseError(f"{where}: logsource.service must be a string")
    if category is not None:
        if not isinstance(category, str) or category not in LOGSOURCE_CATEGORY_MAP:
            supported = ", ".join(sorted(LOGSOURCE_CATEGORY_MAP))
            raise SigmaParseError(
                f"{where}: unsupported logsource.category {category!r} (supported: {supported})"
            )

    detection = document["detection"]
    if not isinstance(detection, dict):
        raise SigmaParseError(f"{where}: detection must be a mapping")
    condition_text = detection.get("condition")
    if not isinstance(condition_text, str) or not condition_text.strip():
        raise SigmaParseError(f"{where}: detection.condition must be a non-empty string")
    raw_selections = {key: value for key, value in detection.items() if key != "condition"}
    if not raw_selections:
        raise SigmaParseError(f"{where}: detection has no selections")

    selections = {
        name: _compile_selection(name, value, where) for name, value in raw_selections.items()
    }
    node = _parse_condition(condition_text, tuple(selections.keys()), where)

    samples = document.get("lab_samples")
    if not isinstance(samples, dict):
        raise SigmaParseError(f"{where}: lab_samples must be a mapping with match/no_match")
    samples_match = _normalize_samples(samples.get("match"), where, "match")
    samples_no_match = _normalize_samples(samples.get("no_match"), where, "no_match")

    return SigmaRule(
        id=lab_id,
        uuid=rule_id,
        title=str(document["title"]).strip(),
        description=" ".join(str(document["description"]).split()),
        level=level,
        mitre=_mitre_tags(document, where),
        false_positives=_string_list(document.get("falsepositives"), where, "falsepositives"),
        response=_string_list(document.get("response"), where, "response"),
        product=product.lower() if product else None,
        category=category,
        service=service,
        source=where,
        condition_text=condition_text.strip(),
        selections=selections,
        node=node,
        samples_match=samples_match,
        samples_no_match=samples_no_match,
        mtime_ns=path.stat().st_mtime_ns,
    )


def _rule_paths(directory: Path) -> list[Path]:
    """Every rule file below ``directory`` (platform sub-folders included)."""
    return sorted(directory.rglob("*.yml")) + sorted(directory.rglob("*.yaml"))


class SigmaRuleSet:
    """Directory-backed rule collection with mtime-based hot reload."""

    def __init__(self, directory: str | Path) -> None:
        self.directory = Path(directory)
        self.rules: dict[str, SigmaRule] = {}
        self._mtimes: dict[str, int] = {}
        self.reload()

    def reload(self) -> int:
        paths = _rule_paths(self.directory)
        if not paths:
            raise SigmaError(f"no Sigma rules (*.yml) found in {self.directory}")
        rules: dict[str, SigmaRule] = {}
        mtimes: dict[str, int] = {}
        for path in paths:
            rule = load_sigma_rule(path)
            if rule.id in rules:
                raise SigmaError(f"duplicate rule id {rule.id!r} in {self.directory}")
            rules[rule.id] = rule
            mtimes[str(path)] = rule.mtime_ns
        self.rules = rules
        self._mtimes = mtimes
        return len(rules)

    def reload_if_changed(self) -> bool:
        """Re-read rules when files are added, removed or modified."""
        try:
            paths = _rule_paths(self.directory)
            current = {str(path): path.stat().st_mtime_ns for path in paths}
        except OSError:
            self.reload()
            return True
        if current != self._mtimes:
            self.reload()
            return True
        return False

    def match_event(self, event: dict[str, Any]) -> list[tuple[str, Bindings]]:
        """Return ``(rule_id, bindings)`` for every rule matching ``event``."""
        matches: list[tuple[str, Bindings]] = []
        for rule_id, rule in self.rules.items():
            matched, bindings = rule.match(event)
            if matched:
                matches.append((rule_id, bindings))
        return matches
