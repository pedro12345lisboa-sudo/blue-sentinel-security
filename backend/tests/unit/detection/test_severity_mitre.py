"""Severity scale and MITRE ATT&CK helpers."""

from __future__ import annotations

import pytest

from app.detection.mitre import from_sigma_tags, merge, title, validate
from app.detection.severity import (
    SEVERITIES,
    SeverityError,
    at_least,
    label,
    max_severity,
    normalize,
    rank,
)


class TestSeverity:
    def test_scale_is_ordered(self) -> None:
        assert SEVERITIES == ("informational", "low", "medium", "high", "critical")
        assert [rank(level) for level in SEVERITIES] == [0, 1, 2, 3, 4]

    def test_normalize_is_case_insensitive(self) -> None:
        assert normalize(" CRITICAL ") == "critical"
        assert normalize("High") == "high"

    def test_unknown_level_raises(self) -> None:
        with pytest.raises(SeverityError):
            normalize("catastrophic")
        with pytest.raises(SeverityError):
            rank(42)  # type: ignore[arg-type]

    def test_max_severity(self) -> None:
        assert max_severity([]) == "informational"
        assert max_severity(["low", "critical", "medium"]) == "critical"
        assert max_severity(["high", "high"]) == "high"

    def test_at_least(self) -> None:
        assert at_least("critical", "high")
        assert at_least("high", "high")
        assert not at_least("medium", "high")

    def test_label(self) -> None:
        assert label("critical") == "Critical"


class TestMitre:
    @pytest.mark.parametrize(
        ("technique", "valid"),
        [("T1110.001", True), ("T1078", True), ("T1078.abc", False), ("t1078", False), ("X1078", False)],
    )
    def test_validate(self, technique: str, valid: bool) -> None:
        assert validate(technique) is valid

    def test_titles_cover_lab_techniques(self) -> None:
        for technique in ("T1110.001", "T1078", "T1059.001", "T1190", "T1070.004"):
            assert title(technique), technique

    def test_from_sigma_tags(self) -> None:
        tags = ["attack.t1110_001", "attack.t1078", "attack.persistence", 42]
        assert from_sigma_tags(tags) == ("T1110.001", "T1078")
        assert from_sigma_tags(None) == ()

    def test_merge_deduplicates_and_sorts(self) -> None:
        assert merge(["T1078", "bad"], ["T1110.001", "T1078"]) == ("T1078", "T1110.001")
