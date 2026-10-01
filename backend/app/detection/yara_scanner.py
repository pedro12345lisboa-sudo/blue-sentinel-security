"""YARA scanning for the BLUE-SENTINEL detection lab.

``yara-python`` is optional: when it is installed the rules are compiled
with the real engine; otherwise a small pure-Python subset parser evaluates
the very same ``*.yar`` files. The subset supports:

* literal strings with the ``ascii``, ``nocase``, ``wide`` and
  ``fullword`` flags (no regex strings - lab rules are literal-only, which
  keeps scanning ReDoS-free),
* boolean conditions (``and`` / ``or`` / ``not``, parentheses) and
  ``of`` expressions (``any of them``, ``all of ($a*)``, ``1 of ($a, $b)``),
* ``meta`` entries; ``level`` (severity) and ``mitre`` are required.

Rules are applied to the harmless synthetic ``event["text"]`` field built by
``app.collectors.normalizer`` - never to real user data, payloads or
exploits. ``yara-python`` is intentionally not pinned in
``requirements.txt``: the optional dependency would have to build libyara in
every CI job, while the built-in parser keeps the lab portable. Installing
``yara-python`` automatically upgrades the scanner to the real engine.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field as dataclass_field
from pathlib import Path
from typing import Any

from app.detection.mitre import is_catalogued
from app.detection.severity import SeverityError, normalize as normalize_severity

try:  # pragma: no cover - exercised only when yara-python is installed
    import yara as _yara
except Exception:  # pragma: no cover - ImportError or broken libyara build
    _yara = None

_KNOWN_FLAGS = frozenset({"ascii", "nocase", "wide", "fullword"})
_SECTION_RE = re.compile(r"^\s*(meta|strings|condition)\s*:\s*$")
_RULE_HEAD_RE = re.compile(r"\brule\s+([A-Za-z_]\w*)\s*\{")
_STRING_RE = re.compile(r'^\s*(\$\w+)\s*=\s*"((?:[^"\\]|\\.)*)"\s*(.*)$')
_IDENT_RE = re.compile(r"^[A-Za-z_]\w*$")


class YaraError(ValueError):
    """A YARA rule file could not be parsed or evaluated."""


# --- comment stripping -----------------------------------------------------


def _strip_comments(text: str) -> str:
    out: list[str] = []
    index = 0
    length = len(text)
    in_string = False
    escaped = False
    while index < length:
        char = text[index]
        if in_string:
            out.append(char)
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            index += 1
            continue
        if char == '"':
            in_string = True
            out.append(char)
            index += 1
            continue
        if char == "/" and index + 1 < length and text[index + 1] == "*":
            end = text.find("*/", index + 2)
            index = length if end == -1 else end + 2
            out.append(" ")
            continue
        if char == "/" and index + 1 < length and text[index + 1] == "/":
            end = text.find("\n", index)
            index = length if end == -1 else end
            continue
        out.append(char)
        index += 1
    return "".join(out)


def _extract_body(text: str, open_index: int) -> tuple[str, int]:
    """Return (body, index_after_closing_brace) for the ``{`` at open_index."""
    depth = 0
    in_string = False
    escaped = False
    index = open_index
    while index < len(text):
        char = text[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
        elif char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[open_index + 1:index], index + 1
        index += 1
    raise YaraError("unterminated rule body (missing '}')")


def _unescape(literal: str) -> str:
    def repl(match: re.Match[str]) -> str:
        code = match.group(1)
        return chr(int(code, 16))

    return re.sub(r"\\x([0-9A-Fa-f]{2})", repl, literal.replace(r"\\", "\0").replace(r"\"", '"').replace("\0", "\\"))


# --- parsed string / condition --------------------------------------------


@dataclass(frozen=True)
class YaraString:
    identifier: str
    literal: str
    nocase: bool = False
    wide: bool = False
    fullword: bool = False

    def find(self, text: str) -> bool:
        haystack, needle = text, self.literal
        found_offsets: list[int] = []
        if self.nocase:
            lowered = needle.lower()
            start = 0
            while True:
                offset = haystack.lower().find(lowered, start)
                if offset == -1:
                    break
                found_offsets.append(offset)
                start = offset + 1
        else:
            start = 0
            while True:
                offset = haystack.find(needle, start)
                if offset == -1:
                    break
                found_offsets.append(offset)
                start = offset + 1
        if self.wide:
            wide_needle = self.literal.encode("utf-16-le")
            data = text.encode("utf-16-le")
            offset = data.find(wide_needle)
            if offset != -1:
                found_offsets.append(offset // 2)
        if not found_offsets:
            return False
        if not self.fullword:
            return True
        for offset in found_offsets:
            before = text[offset - 1] if offset > 0 else ""
            end = offset + len(self.literal)
            after = text[end] if end < len(text) else ""
            if not _is_word(before) and not _is_word(after):
                return True
        return False


def _is_word(char: str) -> bool:
    return bool(char) and (char.isalnum() or char == "_")


class _YNode:
    def evaluate(self, hits: dict[str, bool]) -> bool:
        raise NotImplementedError


@dataclass(frozen=True)
class _YLeaf(_YNode):
    identifier: str

    def evaluate(self, hits: dict[str, bool]) -> bool:
        return hits.get(self.identifier, False)


@dataclass(frozen=True)
class _YNot(_YNode):
    child: _YNode

    def evaluate(self, hits: dict[str, bool]) -> bool:
        return not self.child.evaluate(hits)


@dataclass(frozen=True)
class _YAnd(_YNode):
    children: tuple[_YNode, ...]

    def evaluate(self, hits: dict[str, bool]) -> bool:
        return all(child.evaluate(hits) for child in self.children)


@dataclass(frozen=True)
class _YOr(_YNode):
    children: tuple[_YNode, ...]

    def evaluate(self, hits: dict[str, bool]) -> bool:
        return any(child.evaluate(hits) for child in self.children)


@dataclass(frozen=True)
class _YOf(_YNode):
    identifiers: tuple[str, ...]
    spec: int | str  # int (minimum), "all", "any"

    def evaluate(self, hits: dict[str, bool]) -> bool:
        count = sum(1 for identifier in self.identifiers if hits.get(identifier, False))
        if self.spec == "all":
            return count == len(self.identifiers)
        if self.spec == "any":
            return count > 0
        return count >= int(self.spec)


_Y_TOKEN_RE = re.compile(r"\s*(\(|\)|,|\d+|\$[A-Za-z_]\w*\*?|[A-Za-z_]\w*)")


def _tokenize_condition(text: str) -> list[str]:
    tokens: list[str] = []
    position = 0
    while position < len(text):
        match = _Y_TOKEN_RE.match(text, position)
        if match is None:
            if text[position:].strip() == "":
                break
            raise YaraError(f"cannot tokenize condition near {text[position:position + 24]!r}")
        tokens.append(match.group(1))
        position = match.end()
    return tokens


class _YConditionParser:
    def __init__(self, tokens: list[str], string_ids: tuple[str, ...]) -> None:
        self.tokens = tokens
        self.position = 0
        self.string_ids = string_ids

    def parse(self) -> _YNode:
        if not self.tokens:
            raise YaraError("empty condition")
        node = self._parse_or()
        if self.position != len(self.tokens):
            raise YaraError(f"unexpected token {self.tokens[self.position]!r} in condition")
        return node

    def _parse_or(self) -> _YNode:
        nodes = [self._parse_and()]
        while self._peek_kw("or"):
            self._advance()
            nodes.append(self._parse_and())
        return nodes[0] if len(nodes) == 1 else _YOr(tuple(nodes))

    def _parse_and(self) -> _YNode:
        nodes = [self._parse_not()]
        while self._peek_kw("and"):
            self._advance()
            nodes.append(self._parse_not())
        return nodes[0] if len(nodes) == 1 else _YAnd(tuple(nodes))

    def _parse_not(self) -> _YNode:
        if self._peek_kw("not"):
            self._advance()
            return _YNot(self._parse_not())
        return self._parse_primary()

    def _parse_primary(self) -> _YNode:
        token = self._advance()
        if token == "(":
            node = self._parse_or()
            closing = self._advance()
            if closing != ")":
                raise YaraError(f"expected ')' in condition, got {closing!r}")
            return node
        lowered = token.lower()
        if lowered in ("any", "all") or token.isdigit():
            if not self._peek_kw("of"):
                raise YaraError(f"expected 'of' after {token!r}")
            self._advance()
            target = self._advance()
            spec: int | str = int(token) if token.isdigit() else lowered
            return _YOf(self._resolve(target), spec)
        if token.startswith("$"):
            if "*" in token:
                raise YaraError(f"glob {token!r} is only allowed inside an 'of' expression")
            if token not in self.string_ids:
                raise YaraError(f"condition references unknown string {token!r}")
            return _YLeaf(token)
        raise YaraError(f"unexpected token {token!r} in condition")

    def _resolve(self, target: str) -> tuple[str, ...]:
        if target.lower() == "them":
            if not self.string_ids:
                raise YaraError("'of them' used without strings")
            return self.string_ids
        if target == "(":
            names: list[str] = []
            while True:
                token = self._advance()
                if token == ")":
                    break
                if token == ",":
                    continue
                names.extend(self._resolve_item(token))
            if not names:
                raise YaraError("empty string list in 'of' expression")
            return tuple(names)
        return self._resolve_item(target)

    def _resolve_item(self, item: str) -> tuple[str, ...]:
        if item.startswith("$") and item.endswith("*"):
            prefix = item[:-1]
            names = tuple(i for i in self.string_ids if i.startswith(prefix))
            if not names:
                raise YaraError(f"condition pattern {item!r} matches no string")
            return names
        if item.startswith("$") and item in self.string_ids:
            return (item,)
        raise YaraError(f"condition references unknown string {item!r}")

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
            raise YaraError("condition ended unexpectedly")
        self.position += 1
        return token


def _parse_condition(text: str, string_ids: tuple[str, ...]) -> _YNode:
    return _YConditionParser(_tokenize_condition(text), string_ids).parse()


# --- rule -------------------------------------------------------------------


def _meta_scalar(raw: str, where: str) -> Any:
    raw = raw.strip()
    if raw.startswith('"') and raw.endswith('"') and len(raw) >= 2:
        return _unescape(raw[1:-1])
    if raw in ("true", "false"):
        return raw == "true"
    try:
        return int(raw)
    except ValueError:
        raise YaraError(f"{where}: unsupported meta value {raw!r}") from None


@dataclass(frozen=True)
class YaraRule:
    name: str
    meta: dict[str, Any]
    strings: dict[str, YaraString]
    condition_text: str
    node: _YNode
    source: str
    mtime_ns: int
    matched_bindings: dict[str, dict[str, Any]] = dataclass_field(default_factory=dict)

    @property
    def lab_id(self) -> str:
        return str(self.meta.get("id", self.name))

    @property
    def level(self) -> str:
        return normalize_severity(self.meta.get("level", "medium"))

    @property
    def mitre(self) -> tuple[str, ...]:
        raw = self.meta.get("mitre", "")
        return tuple(part.strip() for part in str(raw).split(",") if part.strip())

    @property
    def title(self) -> str:
        return str(self.meta.get("description", self.name))

    @property
    def false_positives(self) -> tuple[str, ...]:
        raw = self.meta.get("false_positive")
        return (str(raw),) if raw else ()

    @property
    def response(self) -> tuple[str, ...]:
        raw = self.meta.get("response")
        return (str(raw),) if raw else ()

    def scan(self, text: str) -> tuple[bool, list[dict[str, Any]]]:
        """Return (matched, bindings) - bindings list the hit strings."""
        hits = {identifier: yara_string.find(text) for identifier, yara_string in self.strings.items()}
        if not self.node.evaluate(hits):
            return False, []
        bindings = [
            {
                "field": "string",
                "op": "contains" + ("|nocase" if s.nocase else ""),
                "expected": s.literal,
                "actual": text[:240],
            }
            for identifier, s in self.strings.items()
            if hits.get(identifier)
        ]
        return True, bindings


def load_yara_rule(path: Path) -> YaraRule:
    where = str(path)
    text = _strip_comments(path.read_text(encoding="utf-8"))
    head = _RULE_HEAD_RE.search(text)
    if head is None:
        raise YaraError(f"{where}: no 'rule <name> {{' declaration found")
    name = head.group(1)
    body, _ = _extract_body(text, head.end() - 1)

    # Split body into sections (headers sit alone on their own line).
    lines = body.splitlines()
    sections: dict[str, list[str]] = {"meta": [], "strings": [], "condition": []}
    current: str | None = None
    for line in lines:
        header = _SECTION_RE.match(line)
        if header:
            current = header.group(1)
            continue
        if current is not None:
            sections[current].append(line)

    meta: dict[str, Any] = {}
    for line in sections["meta"]:
        stripped = line.strip()
        if not stripped:
            continue
        if "=" not in stripped:
            raise YaraError(f"{where}: malformed meta line {stripped!r}")
        key, _, value = stripped.partition("=")
        meta[key.strip()] = _meta_scalar(value, where)

    strings: dict[str, YaraString] = {}
    for line in sections["strings"]:
        stripped = line.strip()
        if not stripped:
            continue
        match = _STRING_RE.match(stripped)
        if match is None:
            raise YaraError(f"{where}: malformed string declaration {stripped!r}")
        identifier, literal, flags_raw = match.group(1), match.group(2), match.group(3)
        flags = flags_raw.split()
        unknown = [flag for flag in flags if flag not in _KNOWN_FLAGS]
        if unknown:
            raise YaraError(
                f"{where}: unsupported string flag(s) {', '.join(unknown)} on {identifier} "
                "(lab subset supports ascii/nocase/wide/fullword)"
            )
        strings[identifier] = YaraString(
            identifier=identifier,
            literal=_unescape(literal),
            nocase="nocase" in flags,
            wide="wide" in flags,
            fullword="fullword" in flags,
        )

    condition_text = " ".join(line.strip() for line in sections["condition"]).strip()
    if not condition_text:
        raise YaraError(f"{where}: missing condition section")
    if not strings:
        raise YaraError(f"{where}: rule declares no strings")
    node = _parse_condition(condition_text, tuple(strings.keys()))

    if "level" not in meta:
        raise YaraError(f"{where}: meta.level is required")
    try:
        normalize_severity(meta["level"])
    except SeverityError as exc:
        raise YaraError(f"{where}: {exc}") from exc
    for technique in str(meta.get("mitre", "")).split(","):
        technique = technique.strip()
        if technique and not is_catalogued(technique):
            raise YaraError(f"{where}: invalid mitre technique {technique!r}")

    return YaraRule(
        name=name,
        meta=meta,
        strings=strings,
        condition_text=condition_text,
        node=node,
        source=where,
        mtime_ns=path.stat().st_mtime_ns,
    )


# --- scanner ----------------------------------------------------------------


def _rule_paths(directory: Path) -> list[Path]:
    return sorted(directory.glob("*.yar")) + sorted(directory.glob("*.yara"))


class YaraScanner:
    """Directory-backed YARA rule collection with hot reload."""

    def __init__(self, directory: str | Path) -> None:
        self.directory = Path(directory)
        self.rules: dict[str, YaraRule] = {}
        self.using_native_engine: bool = _yara is not None
        self.errors: int = 0
        self._compiled: Any = None
        self._mtimes: dict[str, int] = {}
        self.reload()

    def reload(self) -> int:
        paths = _rule_paths(self.directory)
        if not paths:
            raise YaraError(f"no YARA rules (*.yar) found in {self.directory}")
        rules: dict[str, YaraRule] = {}
        mtimes: dict[str, int] = {}
        for path in paths:
            rule = load_yara_rule(path)
            if rule.name in rules:
                raise YaraError(f"duplicate YARA rule name {rule.name!r} in {self.directory}")
            rules[rule.name] = rule
            mtimes[str(path)] = rule.mtime_ns
        self.rules = rules
        self._mtimes = mtimes
        self._compile_native(paths)
        return len(rules)

    def _compile_native(self, paths: list[Path]) -> None:  # pragma: no cover - optional engine
        if _yara is None:
            self._compiled = None
            self.using_native_engine = False
            return
        filepaths = {path.stem: str(path) for path in paths}
        self._compiled = _yara.compile(filepaths=filepaths)
        self.using_native_engine = True

    def reload_if_changed(self) -> bool:
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

    def scan(self, text: str) -> list[tuple[str, list[dict[str, Any]]]]:
        """Return ``(rule_name, bindings)`` for every rule matching ``text``."""
        if not text:
            return []
        if self._compiled is not None:  # pragma: no cover - optional engine
            try:
                matches = self._compiled.match(data=text.encode("utf-8"), timeout=1)
            except Exception:
                self.errors += 1
                return []
            results: list[tuple[str, list[dict[str, Any]]]] = []
            for match in matches:
                bindings = [
                    {
                        "field": "string",
                        "op": "contains",
                        "expected": instance.matched_data.decode("utf-8", "replace"),
                        "actual": text[:240],
                    }
                    for string in match.strings
                    for instance in string.instances
                ]
                results.append((match.rule, bindings))
            return results
        results = []
        for name, rule in self.rules.items():
            matched, bindings = rule.scan(text)
            if matched:
                results.append((name, bindings))
        return results
