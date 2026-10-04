"""The rule library must stay valid: ``scripts/development/validate_rules.py``.

CI runs the same script as a standalone job; these tests keep it honest from
the pytest suite as well (schema, unique UUIDs, ATT&CK tags, fixtures and the
generated coverage matrix in ``docs/security/attack-coverage.md``).
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

VALIDATOR_PATH = (
    Path(__file__).resolve().parents[4] / "scripts" / "development" / "validate_rules.py"
)


def _load_validator():
    spec = importlib.util.spec_from_file_location("bs_validate_rules", VALIDATOR_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    # dataclasses resolve annotations through sys.modules, so the module has
    # to be registered before it executes.
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def validator():
    return _load_validator()


def test_validator_script_exists() -> None:
    assert VALIDATOR_PATH.is_file()


def test_library_passes_validation(validator, capsys) -> None:
    """Full run: schema, UUIDs, tags, fixtures, hit-rate and ATT&CK matrix."""
    assert validator.main([]) == 0
    output = capsys.readouterr().out
    assert "hit-rate: 50/50 fixtures correct (100.0%)" in output
    assert "OK: rule library is valid." in output


def test_uuid_check_rejects_malformed_ids(validator) -> None:
    report = validator.Report()
    assert validator.check_uuid(report, "demo.yml", "not-a-uuid") is None
    assert validator.check_uuid(report, "demo.yml", "42D1B1A1-7053-4503-9453-2F07F50C699D") is None
    assert any("not a valid UUID" in error for error in report.errors)
    assert any("canonical" in error for error in report.errors)


def test_uuid_check_accepts_a_canonical_uuid(validator) -> None:
    report = validator.Report()
    value = "42d1b1a1-7053-4503-9453-2f07f50c699d"
    assert validator.check_uuid(report, "demo.yml", value) == value
    assert report.errors == []


def test_false_positive_check_rejects_placeholders(validator) -> None:
    report = validator.Report()
    validator.check_false_positives(report, "demo.yml", ["n/a"])
    validator.check_false_positives(report, "demo.yml", "none")
    validator.check_false_positives(report, "demo.yml", None)
    assert len(report.errors) == 3

    ok = validator.Report()
    validator.check_false_positives(
        ok, "demo.yml", ["Administrators running an approved maintenance window"]
    )
    assert ok.errors == []


def test_reference_check_requires_urls(validator) -> None:
    report = validator.Report()
    validator.check_references(report, "demo.yml", ["see the wiki"])
    validator.check_references(report, "demo.yml", [])
    assert len(report.errors) == 2


def test_coverage_matrix_block_is_generated(validator, rules_root: Path) -> None:
    """The committed matrix is exactly what the rules produce today."""
    sigma = validator.check_sigma_rules(validator.Report())
    yara = validator.check_yara_rules(validator.Report())
    patterns = validator.check_patterns(validator.Report())
    block = validator.build_coverage(sigma, yara, patterns)
    assert "| Tactic | Technique | ATT&CK name | Coverage (rule ids) |" in block
    assert "Tactics with no coverage" in block
    doc = (rules_root.parent / "docs" / "security" / "attack-coverage.md").read_text(
        encoding="utf-8"
    )
    assert block.strip() in doc
