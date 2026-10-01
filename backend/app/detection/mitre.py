"""MITRE ATT&CK technique helpers for the detection lab.

Techniques are validated with the official ``T####.###`` format and mapped
to their public page titles so the educational UI can explain each tag.
"""

from __future__ import annotations

import re
from typing import Iterable

TECHNIQUE_RE = re.compile(r"^T\d{4}(\.\d{3})?$")
_TAG_RE = re.compile(r"^attack\.t(\d{4})(?:_(\d{3}))?$", re.IGNORECASE)

# Titles of every technique referenced by lab rules and scenarios.
TECHNIQUES: dict[str, str] = {
    "T1003": "OS Credential Dumping",
    "T1059": "Command and Scripting Interpreter",
    "T1059.001": "Command and Scripting Interpreter: PowerShell",
    "T1070.001": "Indicator Removal: Clear Windows Event Logs",
    "T1070.002": "Indicator Removal: Clear Linux/Mac System Logs",
    "T1070.004": "Indicator Removal: File Deletion",
    "T1071.001": "Application Layer Protocol: Web Protocols",
    "T1078": "Valid Accounts",
    "T1105": "Ingress Tool Transfer",
    "T1110": "Brute Force",
    "T1110.001": "Brute Force: Password Guessing",
    "T1190": "Exploit Public-Facing Application",
}


def validate(technique: object) -> bool:
    """True when ``technique`` is a well-formed ATT&CK technique id."""
    return isinstance(technique, str) and bool(TECHNIQUE_RE.match(technique))


def title(technique: str) -> str | None:
    """Public ATT&CK title for a technique id (None when unknown)."""
    return TECHNIQUES.get(technique)


def is_catalogued(technique: object) -> bool:
    """True when the technique is well-formed AND documented in :data:`TECHNIQUES`.

    Rules may only reference techniques the lab can explain in the UI and in
    ``docs/security/detection-catalog.md``; a typo fails the rule load.
    """
    return validate(technique) and technique in TECHNIQUES


def from_sigma_tags(tags: Iterable[object] | None) -> tuple[str, ...]:
    """Extract technique ids from Sigma ``tags`` such as ``attack.t1110_001``."""
    found: list[str] = []
    for tag in tags or ():
        if not isinstance(tag, str):
            continue
        match = _TAG_RE.match(tag.strip())
        if not match:
            continue
        technique = f"T{match.group(1)}"
        if match.group(2):
            technique = f"{technique}.{match.group(2)}"
        if technique not in found:
            found.append(technique)
    return tuple(found)


def merge(*groups: Iterable[str]) -> tuple[str, ...]:
    """Union of technique groups, sorted for stable output."""
    merged: set[str] = set()
    for group in groups:
        for technique in group:
            if validate(technique):
                merged.add(technique)
    return tuple(sorted(merged))
