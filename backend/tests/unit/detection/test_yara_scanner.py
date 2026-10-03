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
WEBSHELL_1 = "<?php eval($_REQUEST['cmd']); ?>"
WEBSHELL_2 = "<?PHP system($_GET['x']); ?>"
WEBSHELL_3 = "<?php $c = base64_decode($_POST['d']); ?>"
BENIGN_WEB = "/index.html /index.html nginx"


@pytest.fixture(scope="module")
def scanner(rules_root: Path) -> YaraScanner:
    return YaraScanner(rules_root / "yara")


def test_five_published_rules(scanner: YaraScanner) -> None:
    assert set(scanner.rules) == {
        "EICAR_Test_File",
        "Office_Macro_AutoExec",
        "Suspicious_Encoded_Chain",
        "PHP_Webshell_Generic",
        "Phishing_Shortened_URL_Social",
    }


@pytest.mark.parametrize("text", [PS_ENCODED])
def test_encoded_chain_rule_matches(scanner: YaraScanner, text: str) -> None:
    hits = [name for name, _ in scanner.scan(text)]
    assert hits == ["Suspicious_Encoded_Chain"]


@pytest.mark.parametrize("text", [PS_BENIGN, BENIGN_WEB, "cmd.exe /c whoami /all"])
def test_encoded_chain_rule_ignores_benign_text(scanner: YaraScanner, text: str) -> None:
    assert "Suspicious_Encoded_Chain" not in [name for name, _ in scanner.scan(text)]


@pytest.mark.parametrize("text", [WEBSHELL_1, WEBSHELL_2, WEBSHELL_3])
def test_webshell_rule_matches(scanner: YaraScanner, text: str) -> None:
    assert [name for name, _ in scanner.scan(text)] == ["PHP_Webshell_Generic"]


@pytest.mark.parametrize(
    "text",
    [BENIGN_WEB, "<?php echo htmlspecialchars($name); ?>", "An account failed to log on."],
)
def test_webshell_rule_ignores_benign_text(scanner: YaraScanner, text: str) -> None:
    assert "PHP_Webshell_Generic" not in [name for name, _ in scanner.scan(text)]


def test_eicar_rule_needs_both_halves(scanner: YaraScanner) -> None:
    first = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$"
    second = "EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
    assert scanner.scan(first + " " + second)[0][0] == "EICAR_Test_File"
    assert scanner.scan(first)[0:1] == []
    assert scanner.scan(second)[0:1] == []


def test_macro_and_phishing_rules(scanner: YaraScanner) -> None:
    macro = "Sub Auto_Open()\n  Shell \"powershell -e ...\"\nEnd Sub"
    assert [name for name, _ in scanner.scan(macro)] == ["Office_Macro_AutoExec"]
    lure = "Verify your account: bit.ly/9f2kQ and facebook.com/session-check"
    assert [name for name, _ in scanner.scan(lure)] == ["Phishing_Shortened_URL_Social"]
    # A shortener without a social link is not enough for the lure rule.
    assert "Phishing_Shortened_URL_Social" not in [name for name, _ in scanner.scan("bit.ly/9f2kQ")]


def test_scan_returns_explanation_bindings(scanner: YaraScanner) -> None:
    hits = scanner.scan(WEBSHELL_1)
    assert hits and hits[0][1]
    assert any(binding["field"] == "string" for binding in hits[0][1])


def test_rule_metadata(scanner: YaraScanner) -> None:
    rule = scanner.rules["Suspicious_Encoded_Chain"]
    assert rule.level == "high"
    assert rule.mitre == ("T1027",)
    assert rule.lab_id == "bs-yara-encoded-chain"
    assert rule.meta["uuid"] == "8bb3ea83-9375-4de6-87df-b08bdbfa1d35"
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
