"""Shared fixtures for the backend test suite (detection lab)."""

from __future__ import annotations

from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
RULES_ROOT = REPO_ROOT / "rules"


@pytest.fixture(scope="session")
def rules_root() -> Path:
    """Repository rules directory (sigma + yara + correlation patterns)."""
    return RULES_ROOT
