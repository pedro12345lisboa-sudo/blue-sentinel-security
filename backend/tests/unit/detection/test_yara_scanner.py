"""YARA subset: parsing, scanning, validation and hot reload."""

from __future__ import annotations

import os
import textwrap
from pathlib import Path

import pytest

from app.detection.yara_scanner import (
    YaraError,
    YaraScanner,
    load_yara_rule,
)

PS_ENCODED = (
    "powershell.exe -nop -w hidden -enc SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQA "
    "C:\\Users\\jsilva\\AppData\\Local\\Temp\\update.ps1 powershell.exe jsilva"
)
PS_BENIGN = "powershell.exe -File C:\\scripts\\report.ps1 powershell.exe jsilva"
SQLI_1 = "/products /products?id=1'%20OR%20'1'='1 nginx"
SQLI_2 = "/search /search?q=UNION%20SELECT%20username%20FROM%20users nginx"
SQLI_3 = "/items /items?id=1;WAITFOR%20DELAY%20'0:0:5' nginx"
BENIGN_WEB = "/index.html /index.html nginx"


@pytest.fixture(scope="module")
def scanner(rules_root: Path) -> YaraScanner:
    return YaraScanner(rules_root / "yara")


def test_two_published_rules(scanner: YaraScanner) -> None:
    assert set(scanner.rules) == {
        "Suspicious_PowerShell_Commandline",
        "Web_SQLi_Access_Log",
    }


@pytest.mark.parametrize("text", [PS_ENCODED])
def test_powershell_rule_matches(scanner: YaraScanner, text: str) -> None:
    hits = [name for name, _ in scanner.scan(text)]
    assert hits == ["Suspicious_PowerShell_Commandline"]


@pytest.mark.parametrize("text", [PS_BENIGN, SQLI_1, BENIGN_WEB, "cmd.exe /c whoami /all"])
def test_powershell_rule_ignores_benign_text(scanner: YaraScanner, text: str) -> None:
    assert "Suspicious_PowerShell_Commandline" not in [name for name, _ in scanner.scan(text)]


@pytest.mark.parametrize("text", [SQLI_1, SQLI_2, SQLI_3])
def test_sqli_rule_matches(scanner: YaraScanner, text: str) -> None:
    assert [name for name, _ in scanner.scan(text)] == ["Web_SQLi_Access_Log"]


@pytest.mark.parametrize("text", [BENIGN_WEB, "/about /about nginx", "An account failed to log on."])
def test_sqli_rule_ignores_benign_text(scanner: YaraScanner, text: str) -> None:
    assert "Web_SQLi_Access_Log" not in [name for name, _ in scanner.scan(text)]


def test_scan_returns_explanation_bindings(scanner: YaraScanner) -> None:
    hits = scanner.scan(SQLI_1)
    assert hits and hits[0][1]
    assert any(binding["field"] == "string" for binding in hits[0][1])


def test_rule_metadata(scanner: YaraScanner) -> None:
    rule = scanner.rules["Suspicious_PowerShell_Commandline"]
    assert rule.level == "high"
    assert rule.mitre == ("T1059.001",)
    assert rule.lab_id == "bs-yara-ps-encoded"
    assert rule.false_positives and rule.response


def _write(tmp_path: Path, body: str) -> Path:
    path = tmp_path / "rule.yar"
    path.write_text(textwrap.dedent(body), encoding="utf-8")
    return path


def test_missing_level_is_rejected(tmp_path: Path) -> None:
    path = _write(
        tmp_path,
        """
        rule NoLevel {
          strings:
            $a = "x"
          condition:
            $a
        }
        """,
    )
    with pytest.raises(YaraError, match="level"):
        load_yara_rule(path)


def test_invalid_mitre_is_rejected(tmp_path: Path) -> None:
    path = _write(
        tmp_path,
        """
        rule BadMitre {
          meta:
            level = "high"
            mitre = "T0000"
          strings:
            $a = "x"
          condition:
            $a
        }
        """,
    )
    with pytest.raises(YaraError, match="mitre"):
        load_yara_rule(path)


def test_unknown_string_flag_is_rejected(tmp_path: Path) -> None:
    path = _write(
        tmp_path,
        """
        rule BadFlag {
          meta:
            level = "low"
          strings:
            $a = "x" xor(1-255)
          condition:
            $a
        }
        """,
    )
    with pytest.raises(YaraError, match="unsupported string flag"):
        load_yara_rule(path)


def test_unknown_string_in_condition_is_rejected(tmp_path: Path) -> None:
    path = _write(
        tmp_path,
        """
        rule BadCondition {
          meta:
            level = "low"
          strings:
            $a = "x"
          condition:
            $b
        }
        """,
    )
    with pytest.raises(YaraError, match="unknown string"):
        load_yara_rule(path)


def test_comments_are_ignored(tmp_path: Path) -> None:
    path = _write(
        tmp_path,
        """
        /* header
           multi-line */
        rule WithComments { // trailing
          meta:
            level = "low"
          strings:
            $a = "hello" // hit me
          condition:
            $a
        }
        """,
    )
    rule = load_yara_rule(path)
    assert rule.scan("say hello there")[0] is True
    assert rule.scan("nothing")[0] is False


def test_of_expression_conditions(tmp_path: Path) -> None:
    path = _write(
        tmp_path,
        """
        rule OfExpr {
          meta:
            level = "low"
          strings:
            $a = "alpha"
            $b = "beta"
            $c = "gamma"
          condition:
            any of them
        }
        """,
    )
    rule = load_yara_rule(path)
    assert rule.scan("beta time")[0] is True
    assert rule.scan("delta")[0] is False

    path.write_text(
        textwrap.dedent(
            """
            rule OfExpr2 {
              meta:
                level = "low"
              strings:
                $a = "alpha"
                $b = "beta"
                $c = "gamma"
              condition:
                all of ($a, $b) or $c
            }
            """
        ),
        encoding="utf-8",
    )
    rule = load_yara_rule(path)
    assert rule.scan("alpha and beta")[0] is True
    assert rule.scan("alpha only")[0] is False
    assert rule.scan("gamma!")[0] is True


def test_hot_reload_picks_up_edits(tmp_path: Path) -> None:
    source = textwrap.dedent(
        """
        rule Reloadable {
          meta:
            level = "low"
          strings:
            $a = "needle"
          condition:
            $a
        }
        """
    )
    path = _write(tmp_path, source)
    scanner = YaraScanner(tmp_path)
    assert scanner.rules["Reloadable"].level == "low"
    assert scanner.reload_if_changed() is False

    path.write_text(source.replace('level = "low"', 'level = "critical"'), encoding="utf-8")
    stat = path.stat()
    os.utime(path, (stat.st_atime, stat.st_mtime + 10))
    assert scanner.reload_if_changed() is True
    assert scanner.rules["Reloadable"].level == "critical"
