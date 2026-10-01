"""Small helpers shared by backend tests (no framework dependencies)."""

from __future__ import annotations

import itertools
from typing import Any

from app.collectors.normalizer import normalize

_COUNTER = itertools.count(1)


def make_event(
    timestamp: str,
    *,
    event_id: str | None = None,
    category: str = "auth",
    action: str = "failed_logon",
    host: str = "HOST-1",
    user: str = "user1",
    product: str = "windows",
    **extra: Any,
) -> dict[str, Any]:
    """Build a normalised lab event for unit tests."""
    record: dict[str, Any] = {
        "timestamp": timestamp,
        "category": category,
        "action": action,
        "event_id": "4625" if category == "auth" else "-",
        "host": host,
        "user": user,
        "product": product,
    }
    record.update(extra)
    if event_id is None:
        event_id = f"evt-{next(_COUNTER)}"
    return normalize(record, event_id)
