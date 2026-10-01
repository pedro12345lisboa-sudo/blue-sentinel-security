"""Severity model shared by Sigma rules, YARA rules and correlation patterns.

Scale (documented in ``docs/security/severity.md``):

    informational < low < medium < high < critical
"""

from __future__ import annotations

SEVERITIES: tuple[str, ...] = ("informational", "low", "medium", "high", "critical")

_RANK: dict[str, int] = {name: index for index, name in enumerate(SEVERITIES)}

# Human labels used by the API; the UI localises the same keys.
LABELS: dict[str, str] = {
    "informational": "Informational",
    "low": "Low",
    "medium": "Medium",
    "high": "High",
    "critical": "Critical",
}


class SeverityError(ValueError):
    """Raised when an unknown severity level is supplied."""


def normalize(level: object) -> str:
    """Return the canonical severity name for ``level`` (case-insensitive)."""
    if not isinstance(level, str):
        raise SeverityError(f"severity must be a string, got {type(level).__name__}")
    name = level.strip().lower()
    if name not in _RANK:
        raise SeverityError(f"unknown severity: {level!r} (expected one of {', '.join(SEVERITIES)})")
    return name


def rank(level: object) -> int:
    """Numeric rank of ``level`` (higher is more severe)."""
    return _RANK[normalize(level)]


def max_severity(levels: object) -> str:
    """Most severe entry of an iterable of levels (empty -> informational)."""
    best = "informational"
    best_rank = -1
    for level in levels or ():  # type: ignore[union-attr]
        candidate = normalize(level)
        candidate_rank = _RANK[candidate]
        if candidate_rank > best_rank:
            best, best_rank = candidate, candidate_rank
    return best


def at_least(level: object, threshold: object) -> bool:
    """True when ``level`` is at least as severe as ``threshold``."""
    return rank(level) >= rank(threshold)


def label(level: object) -> str:
    """Display label for ``level``."""
    return LABELS[normalize(level)]
