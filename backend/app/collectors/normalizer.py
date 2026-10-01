"""Normalisation of synthetic records into the lab's common event schema.

Common schema (all timestamps UTC ISO-8601):

    id            str   event reference (assigned by the runner)
    timestamp     str   UTC ISO-8601, second precision
    host          str
    user          str   "-" when not applicable
    process       str   "-" when not applicable
    command_line  str   "-" when not applicable
    ip            str   "-" when not applicable
    category      str   auth | process | network | file | audit | web | dns
    action        str   provider-style action (logon, failed_logon, ...)
    event_id      str   provider event id when the source has one
    product       str   windows | linux | generic
    hour          int   0-23 derived from the UTC timestamp (rule friendly)
    fields        dict  scenario specific extras (url, port, country, ...)
    text          str   free text concatenated for YARA scanning
    raw           dict  untouched synthetic record (shown in the UI)

The flat "sigma view" of an event is the top level keys merged with
`fields` (top level wins) and is what Sigma selections are matched
against.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

CATEGORIES = ("auth", "process", "network", "file", "audit", "web", "dns")

DEFAULTS: dict[str, Any] = {
    "host": "-",
    "user": "-",
    "process": "-",
    "command_line": "-",
    "ip": "-",
    "action": "-",
    "event_id": "-",
    "product": "generic",
}

# Fields promoted from `fields` to the flat sigma view even when the
# record also carries them at the top level (kept for readability).
_TEXT_FIELDS = ("command_line", "path", "url", "message", "process", "user", "detail")


class NormalizationError(ValueError):
    """Raised when a synthetic record cannot be normalised."""


def parse_timestamp(value: Any) -> datetime:
    """Parse an ISO-8601 timestamp (naive values are assumed UTC)."""
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str):
        text = value.strip().replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(text)
        except ValueError as exc:
            raise NormalizationError(f"invalid timestamp: {value!r}") from exc
    else:
        raise NormalizationError(f"unsupported timestamp type: {type(value).__name__}")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def normalize(record: dict[str, Any], event_id: str = "evt-0") -> dict[str, Any]:
    """Convert a raw synthetic record into the common event schema."""
    if "timestamp" not in record:
        raise NormalizationError("record is missing 'timestamp'")
    if "category" not in record:
        raise NormalizationError("record is missing 'category'")

    category = str(record["category"]).lower()
    if category not in CATEGORIES:
        raise NormalizationError(f"unknown category: {category!r}")

    ts = parse_timestamp(record["timestamp"])
    known = {key: record.get(key, DEFAULTS[key]) for key in DEFAULTS}
    extras = {
        key: value
        for key, value in record.items()
        if key not in known and key != "timestamp" and key != "raw"
    }

    fields = {key: value for key, value in extras.items() if value is not None}
    event: dict[str, Any] = {
        "id": event_id,
        "timestamp": ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "host": str(known["host"]),
        "user": str(known["user"]),
        "process": str(known["process"]),
        "command_line": str(known["command_line"]),
        "ip": str(known["ip"]),
        "category": category,
        "action": str(record.get("action", DEFAULTS["action"])),
        "event_id": str(record.get("event_id", DEFAULTS["event_id"])),
        "product": str(record.get("product", DEFAULTS["product"])),
        "hour": ts.hour,
        "fields": fields,
        "text": _build_text(known, fields),
        "raw": dict(record),
    }
    return event


def sigma_view(event: dict[str, Any]) -> dict[str, Any]:
    """Flat mapping used to evaluate Sigma selections against an event."""
    view = dict(event.get("fields", {}))
    for key, value in event.items():
        if key in ("fields", "raw", "text"):
            continue
        if value is not None:
            view[key] = value
    return view


def _build_text(known: dict[str, Any], fields: dict[str, Any]) -> str:
    parts: list[str] = []
    for key in _TEXT_FIELDS:
        value = known.get(key) or fields.get(key)
        if value and value != "-":
            parts.append(str(value))
    return " ".join(parts)
