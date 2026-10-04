"""YARA subset: loading, string flags, conditions, validation and hot reload.

Everything scanned here is inert lab text: the published rules are exercised
through the synthetic fixtures in ``tests/fixtures/detection`` and the ad-hoc
rules written below only carry canary words such as ``lab-canary``. No sample,
payload or executable is downloaded, unpacked or run by this suite.
"""

from __future__ import annotations

import json
import textwrap
import uuid as uuid_module
from pathlib import Path
from typing import Any

import pytest

from app.detection.yara_scanner import (
    YaraError,
    YaraScanner,
    YaraString,
    load_yara_rule,
)

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "detection"

PUBLISHED: dict[str, str] = {
    "EICAR_Test_File": "bs-yara-eicar",
    "Office_Macro_AutoExec": "bs-yara-office-macro",
    "Suspicious_Encoded_Chain": "bs-yara-encoded-chain",
    "PHP_Webshell_Generic": "bs-yara-php-webshell",
    "Phishing_Shortened_URL_Social": "bs-yara-phishing-shorturl",
}


def _rule_body(
    name: str,
    strings: list[str],
    condition: str,
    *,
    level: str = "medium",
    mitre: str = "T1059",
    extra_meta: str = "",
) -> str:
    declared = "\n".join(f"        {line}" for line in strings)
    return textwrap.dedent(
        f"""
        rule {name} {{
            meta:
                id = "bs-test-{name.lower()}"
                description = "synthetic unit-test rule"
                author = "Pedro Lisboa"
                date = "2026/10/02"
                level = "{level}"
                mitre = "{mitre}"
                false_positive = "unit tests in this repository"
                response = "no action - synthetic fixture"
        {extra_meta}
            strings:
        {declared}
            condition:
                {condition}
        }}
        """
    )


def _write(directory: Path, name: str, body: str) -> Path:
    path = directory / f"{name}.yar"
    path.write_text(body, encoding="utf-8")
    return path


def _load_fixture(folder: str, rule: str) -> dict[str, Any]:
    path = FIXTURES / folder / f"{rule}.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload


# --- published collection ---------------------------------------------------


@pytest.fixture(scope="module")
def scanner(rules_root: Path) -> YaraScanner:
    return YaraScanner(rules_root / "yara")


def test_five_published_rules_load(scanner: YaraScanner) -> None:
    assert set(scanner.rules) == set(PUBLISHED)
    for name, lab_id in PUBLISHED.items():
        rule = scanner.rules[name]
        assert rule.lab_id == lab_id, name
        assert rule.source.endswith(".yar"), name


def test_every_published_rule_carries_metadata(scanner: YaraScanner) -> None:
    from app.detection.severity import SEVERITIES

    for name, rule in scanner.rules.items():
        uuid_module.UUID(str(rule.meta["uuid"]))  # raises on a malformed id
        assert str(rule.meta["author"]).strip(), name
        assert str(rule.meta["date"]).strip(), name
        assert str(rule.meta["false_positive"]).strip(), name
        assert str(rule.meta["response"]).strip(), name
        assert rule.level in SEVERITIES, name
        assert rule.strings, name


def test_published_rule_metadata_is_specific(scanner: YaraScanner) -> None:
    rule = scanner.rules["Suspicious_Encoded_Chain"]
    assert rule.level == "high"
    assert rule.mitre == ("T1027",)
    assert rule.lab_id == "bs-yara-encoded-chain"
    assert rule.meta["uuid"] == "8bb3ea83-9375-4de6-87df-b08bdbfa1d35"
    assert rule.false_positives and rule.response


@pytest.mark.parametrize("rule_name", sorted(PUBLISHED))
def test_positive_fixture_matches_its_rule(scanner: YaraScanner, rule_name: str) -> None:
    from app.collectors.normalizer import normalize

    event = normalize(_load_fixture("positive", rule_name)["event"])
    hits = [name for name, _ in scanner.scan(event["text"])]
    assert rule_name in hits, f"{rule_name} did not fire on its positive fixture"


@pytest.mark.parametrize("rule_name", sorted(PUBLISHED))
def test_negative_fixture_does_not_match(scanner: YaraScanner, rule_name: str) -> None:
    from app.collectors.normalizer import normalize

    event = normalize(_load_fixture("negative", rule_name)["event"])
    hits = [name for name, _ in scanner.scan(event["text"])]
    assert rule_name not in hits, f"{rule_name} fired on its negative fixture"


def test_scan_reports_bindings_for_the_explanation_panel(scanner: YaraScanner) -> None:
    payload = _load_fixture("positive", "Office_Macro_AutoExec")
    from app.collectors.normalizer import normalize

    text = normalize(payload["event"])["text"]
    hits = scanner.scan(text)
    assert hits, "expected at least one match"
    name, bindings = hits[0]
    assert name in PUBLISHED
    assert bindings and bindings[0]["field"] == "string"
    assert bindings[0]["actual"]


def test_scan_of_empty_text_is_a_no_op(scanner: YaraScanner) -> None:
    assert scanner.scan("") == []


def test_native_engine_flag_is_reported(scanner: YaraScanner) -> None:
    assert scanner.using_native_engine in (True, False)
    assert isinstance(scanner.errors, int)


# --- string matching --------------------------------------------------------


def test_literal_is_case_sensitive_by_default() -> None:
    value = YaraString("$a", "lab-canary")
    assert value.find("see lab-canary here")
    assert not value.find("see LAB-CANARY here")


def test_nocase_flag_ignores_case() -> None:
    value = YaraString("$a", "lab-canary", nocase=True)
    assert value.find("see LAB-CANARY here")


def test_fullword_flag_rejects_prefix_hits() -> None:
    value = YaraString("$a", "lab", fullword=True)
    assert value.find("deploy the lab now")
    assert not value.find("deploy labels now")


def test_wide_flag_matches_utf16_text() -> None:
    value = YaraString("$a", "lab", wide=True)
    assert value.find("deploy lab now")
    assert not value.find("deploy now")


# --- conditions --------------------------------------------------------------


@pytest.mark.parametrize(
    ("condition", "text", "expected"),
    [
        ("any of them", "payload lab-canary", True),
        ("any of them", "payload unrelated", False),
        ("all of them", "lab-canary second-canary tail-mark marker-glob marker-nog", True),
        ("all of them", "lab-canary second-canary", False),
        ("1 of ($a, $b)", "just second-canary", True),
        ("1 of ($a, $b)", "nothing here", False),
        ("all of ($a, $b)", "lab-canary second-canary tail-mark", True),
        ("all of ($a, $b)", "lab-canary tail-mark", False),
        ("all of ($a, $b) or $c", "tail-mark alone", True),
        ("all of ($a, $b) or $c", "lab-canary", False),
        ("$a and not $b", "lab-canary", True),
        ("$a and not $b", "lab-canary second-canary", False),
        ("any of ($g*)", "a marker-glob one", True),
        ("any of ($g*)", "a marker-nog", False),
        ("($a or $b) and $c", "lab-canary tail-mark", True),
        ("($a or $b) and $c", "lab-canary", False),
    ],
)
def test_conditions_evaluate_correctly(
    tmp_path: Path, condition: str, text: str, expected: bool
) -> None:
    _write(
        tmp_path,
        "cond",
        _rule_body(
            "Cond",
            [
                '$a = "lab-canary" ascii',
                '$b = "second-canary" ascii',
                '$c = "tail-mark" ascii',
                '$g_one = "marker-glob" ascii',
                '$x_two = "marker-nog" ascii',
            ],
            condition,
        ),
    )
    scanner = YaraScanner(tmp_path)
    assert bool(scanner.scan(text)) is expected


def test_comments_are_ignored_by_the_parser(tmp_path: Path) -> None:
    body = textwrap.dedent(
        """
        // leading line comment
        rule Commented
        {
            /* block comment
               with a fake rule header: rule Decoy { */
            meta:
                id = "bs-test-commented"
                description = "x"
                author = "Pedro Lisboa"
                date = "2026/10/02"
                level = "low"
                mitre = ""
                false_positive = "unit tests"
                response = "none"
            strings:
                $a = "lab-canary" ascii
            condition:
                $a
        }
        """
    )
    _write(tmp_path, "commented", body)
    scanner = YaraScanner(tmp_path)
    assert scanner.scan("payload lab-canary")
    assert not scanner.scan("payload plain")


# --- validation --------------------------------------------------------------


def _invalid(name: str, body: str, match: str, tmp_path: Path) -> None:
    path = _write(tmp_path, name, body)
    with pytest.raises(YaraError, match=match):
        load_yara_rule(path)


def test_unknown_string_in_condition_is_rejected(tmp_path: Path) -> None:
    _invalid(
        "bad-cond",
        _rule_body("BadCond", ['$a = "lab-canary" ascii'], "$missing"),
        "unknown string",
        tmp_path,
    )


def test_unsupported_string_flag_is_rejected(tmp_path: Path) -> None:
    _invalid(
        "bad-flag",
        _rule_body("BadFlag", ['$a = "lab-canary" xor'], "$a"),
        "unsupported string flag",
        tmp_path,
    )


def test_missing_condition_is_rejected(tmp_path: Path) -> None:
    body = textwrap.dedent(
        """
        rule NoCondition
        {
            meta:
                level = "low"
                mitre = ""
            strings:
                $a = "lab-canary" ascii
        }
        """
    )
    _invalid("no-condition", body, "missing condition", tmp_path)


def test_rule_without_strings_is_rejected(tmp_path: Path) -> None:
    body = textwrap.dedent(
        """
        rule NoStrings
        {
            meta:
                level = "low"
                mitre = ""
            condition:
                any of them
        }
        """
    )
    _invalid("no-strings", body, "declares no strings", tmp_path)


def test_missing_level_is_rejected(tmp_path: Path) -> None:
    body = textwrap.dedent(
        """
        rule NoLevel
        {
            meta:
                mitre = ""
            strings:
                $a = "lab-canary" ascii
            condition:
                $a
        }
        """
    )
    _invalid("no-level", body, "meta.level is required", tmp_path)


def test_unknown_level_is_rejected(tmp_path: Path) -> None:
    _invalid(
        "bad-level",
        _rule_body("BadLevel", ['$a = "lab-canary" ascii'], "$a", level="urgent"),
        "unknown severity",
        tmp_path,
    )


def test_uncatalogued_mitre_technique_is_rejected(tmp_path: Path) -> None:
    _invalid(
        "bad-mitre",
        _rule_body("BadMitre", ['$a = "lab-canary" ascii'], "$a", mitre="T9999.999"),
        "invalid mitre technique",
        tmp_path,
    )


def test_file_without_rule_declaration_is_rejected(tmp_path: Path) -> None:
    _invalid("empty", "// nothing to see here\n", "no 'rule <name>", tmp_path)


def test_unterminated_body_is_rejected(tmp_path: Path) -> None:
    _invalid("unterminated", "rule Broken { meta: level = \"low\"", "unterminated", tmp_path)


def test_malformed_string_declaration_is_rejected(tmp_path: Path) -> None:
    _invalid(
        "bad-string",
        _rule_body("BadString", ["$a lab-canary"], "$a"),
        "malformed string declaration",
        tmp_path,
    )


# --- collection behaviour ----------------------------------------------------


def test_duplicate_rule_names_are_rejected(tmp_path: Path) -> None:
    body = _rule_body("Dup", ['$a = "lab-canary" ascii'], "$a")
    _write(tmp_path, "first", body)
    _write(tmp_path, "second", body)
    with pytest.raises(YaraError, match="duplicate YaraRule name|duplicate"):
        YaraScanner(tmp_path)


def test_directory_without_rules_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(YaraError, match="no YARA rules"):
        YaraScanner(tmp_path)


def test_hot_reload_picks_up_edits(tmp_path: Path) -> None:
    path = _write(tmp_path, "reloadable", _rule_body("Reloadable", ['$a = "lab-canary" ascii'], "$a"))
    scanner = YaraScanner(tmp_path)
    assert scanner.rules["Reloadable"].level == "medium"
    assert scanner.reload_if_changed() is False

    path.write_text(_rule_body("Reloadable", ['$a = "lab-canary" ascii'], "$a", level="high"), encoding="utf-8")
    assert scanner.reload_if_changed() is True
    assert scanner.rules["Reloadable"].level == "high"
