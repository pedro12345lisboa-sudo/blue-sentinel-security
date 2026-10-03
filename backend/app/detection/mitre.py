"""MITRE ATT&CK technique helpers for the detection lab.

Techniques are validated with the official ``T####.###`` format and mapped
to their public page titles so the educational UI can explain each tag.
"""

from __future__ import annotations

import re
from typing import Iterable

TECHNIQUE_RE = re.compile(r"^T\d{4}(\.\d{3})?$")
_TAG_RE = re.compile(r"^attack\.t(\d{4})(?:_(\d{3}))?$", re.IGNORECASE)

# Titles of every technique referenced by lab rules, correlation patterns and
# scenarios (see docs/security/attack-coverage.md for the tactic matrix and
# the declared gaps). A rule may only tag techniques present here.
TECHNIQUES: dict[str, str] = {
    "T1021.001": "Remote Services: Remote Desktop Protocol",
    "T1027": "Obfuscated Files or Information",
    "T1053.003": "Scheduled Task/Job: Cron",
    "T1053.005": "Scheduled Task/Job: Scheduled Task",
    "T1059": "Command and Scripting Interpreter",
    "T1059.001": "Command and Scripting Interpreter: PowerShell",
    "T1059.005": "Command and Scripting Interpreter: Visual Basic",
    "T1070.001": "Indicator Removal: Clear Windows Event Logs",
    "T1070.004": "Indicator Removal: File Deletion",
    "T1071.001": "Application Layer Protocol: Web Protocols",
    "T1078": "Valid Accounts",
    "T1098": "Account Manipulation",
    "T1098.001": "Account Manipulation: Additional Cloud Credentials",
    "T1105": "Ingress Tool Transfer",
    "T1110.001": "Brute Force: Password Guessing",
    "T1136.001": "Create Account: Local Account",
    "T1190": "Exploit Public-Facing Application",
    "T1204.002": "User Execution: Malicious File",
    "T1505.003": "Server Software Component: Web Shell",
    "T1543.003": "Create or Modify System Process: Windows Service",
    "T1547.001": "Boot or Logon Autostart Execution: Registry Run Keys / Startup Folder",
    "T1548.003": "Abuse Elevation Control Mechanism: Sudo and Sudo Caching",
    "T1566.002": "Phishing: Spearphishing Link",
    "T1595.002": "Active Scanning: Vulnerability Scanning",
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
