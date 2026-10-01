"""Scripted synthetic scenarios for the interactive detection lab.

Five defensive-only scenarios. Every record is fabricated: RFC 5737 /
RFC 3927 documentation addresses, demo hostnames, placeholder users and
harmless command lines. Nothing here executes anything, collects real
telemetry or reproduces an exploit.

Pacing vs. simulated time:

* ``ScenarioStep.delay_seconds`` is the *wall-clock* pacing gap at 1x
  speed (small: 1.2-2.0 s).
* The ``timestamp`` inside each record is the *simulated* clock and may
  jump hours between steps (e.g. a daytime logon followed by a 03:14
  logon). Correlation windows and alert de-duplication always run on the
  simulated clock so behaviour is identical at any speed.
"""

from __future__ import annotations

from typing import Any

from app.collectors.base import BaseCollector, Scenario, ScenarioStep

# --- helpers ---------------------------------------------------------------


def _ts(day: str, time: str) -> str:
    return f"{day}T{time}Z"


def _auth(
    ts: str,
    action: str,
    event_id: str,
    *,
    host: str = "WS-DEMO-01",
    user: str = "jsilva",
    ip: str = "198.51.100.20",
    product: str = "windows",
    message: str = "",
    **extra: Any,
) -> dict:
    record: dict[str, Any] = {
        "timestamp": ts,
        "category": "auth",
        "action": action,
        "event_id": event_id,
        "host": host,
        "user": user,
        "ip": ip,
        "product": product,
        "process": "-",
        "command_line": "-",
        "message": message,
    }
    record.update(extra)
    return record


def _process(
    ts: str,
    process: str,
    command_line: str,
    *,
    host: str = "WS-DEMO-01",
    user: str = "jsilva",
    ip: str = "198.51.100.20",
    path: str = "",
    product: str = "windows",
    event_id: str = "4688",
    **extra: Any,
) -> dict:
    record: dict[str, Any] = {
        "timestamp": ts,
        "category": "process",
        "action": "process_start",
        "event_id": event_id,
        "host": host,
        "user": user,
        "ip": ip,
        "product": product,
        "process": process,
        "command_line": command_line,
        "path": path or f"C:\\Windows\\System32\\{process}",
    }
    record.update(extra)
    return record


def _network(
    ts: str,
    *,
    host: str = "WS-DEMO-01",
    user: str = "jsilva",
    ip: str = "198.51.100.20",
    destination: str = "198.51.100.66",
    port: int = 443,
    process: str = "chrome.exe",
    product: str = "windows",
    **extra: Any,
) -> dict:
    record: dict[str, Any] = {
        "timestamp": ts,
        "category": "network",
        "action": "outbound_connection",
        "host": host,
        "user": user,
        "ip": ip,
        "process": process,
        "destination_ip": destination,
        "port": port,
        "product": product,
    }
    record.update(extra)
    return record


# --- scenarios -------------------------------------------------------------


def brute_force_scenario() -> Scenario:
    """6 failed logons 12 s apart, then a success from the same source.

    The failures stay inside one 120 s de-duplication window (a single
    alert with ``count == 6``) and the success lands 32 s after the fifth
    failure, comfortably inside the 300 s correlation window.
    """
    day = "2024-06-18"
    steps: list[ScenarioStep] = []
    attacker = "203.0.113.77"  # RFC 5737 TEST-NET-3
    for i in range(6):
        second = i * 12
        steps.append(
            ScenarioStep(
                delay_seconds=1.2,
                record=_auth(
                    _ts(day, f"13:{10 + second // 60:02d}:{second % 60:02d}"),
                    "failed_logon",
                    "4625",
                    ip=attacker,
                    message="An account failed to log on.",
                ),
            )
        )
    steps.append(
        ScenarioStep(
            delay_seconds=2.0,
            record=_auth(
                _ts(day, "13:11:20"),
                "logon",
                "4624",
                ip=attacker,
                new_source=True,
                message="An account was successfully logged on.",
            ),
        )
    )
    steps.append(
        ScenarioStep(
            delay_seconds=1.5,
            record=_process(
                _ts(day, "13:11:35"),
                "cmd.exe",
                "cmd.exe /c whoami /all",
                ip=attacker,
            ),
        )
    )
    steps.append(
        ScenarioStep(
            delay_seconds=1.5,
            record=_process(
                _ts(day, "13:11:50"),
                "explorer.exe",
                "explorer.exe",
                ip=attacker,
            ),
        )
    )
    return Scenario(
        id="brute-force",
        name="Credential brute force",
        description=(
            "Repeated failed logons for the same user followed by a success "
            "from a new source - password spraying / brute force (T1110.001)."
        ),
        steps=tuple(steps),
        expected_rules=("bs-auth-failed-logons", "corr-brute-force-sequence"),
        expected_severity="critical",
        mitre=("T1110.001", "T1078"),
    )


def after_hours_scenario() -> Scenario:
    """Successful logon at 03:14 from a brand-new source/country (T1078)."""
    steps = [
        ScenarioStep(
            delay_seconds=1.2,
            record=_auth(
                _ts("2024-01-09", "14:00:00"),
                "logon",
                "4624",
                host="SRV-DEMO-02",
                user="admin.demo",
                ip="198.51.100.20",
                new_source=False,
                country="PT",
                message="An account was successfully logged on.",
            ),
        ),
        ScenarioStep(
            delay_seconds=1.2,
            record=_process(
                _ts("2024-01-09", "14:01:10"),
                "explorer.exe",
                "explorer.exe",
                host="SRV-DEMO-02",
                user="admin.demo",
                ip="198.51.100.20",
            ),
        ),
        ScenarioStep(
            delay_seconds=2.0,
            record=_auth(
                _ts("2024-01-10", "03:14:10"),
                "logon",
                "4624",
                host="SRV-DEMO-02",
                user="admin.demo",
                ip="203.0.113.90",
                new_source=True,
                country="SG",
                message="An account was successfully logged on.",
            ),
        ),
        ScenarioStep(
            delay_seconds=1.5,
            record=_process(
                _ts("2024-01-10", "03:15:02"),
                "cmd.exe",
                "cmd.exe /c whoami /priv",
                host="SRV-DEMO-02",
                user="admin.demo",
                ip="203.0.113.90",
            ),
        ),
        ScenarioStep(
            delay_seconds=1.5,
            record={
                "timestamp": _ts("2024-01-10", "03:16:40"),
                "category": "dns",
                "action": "dns_query",
                "host": "SRV-DEMO-02",
                "user": "admin.demo",
                "ip": "203.0.113.90",
                "process": "svchost.exe",
                "domain": "updates.example",
                "product": "windows",
            },
        ),
    ]
    return Scenario(
        id="after-hours-login",
        name="After-hours login from a new source",
        description=(
            "Successful logon at 03:14 from a country/IP never seen for this "
            "account, followed by discovery commands (T1078)."
        ),
        steps=tuple(steps),
        expected_rules=("bs-auth-logon-out-of-hours",),
        expected_severity="high",
        mitre=("T1078", "T1003"),
    )


def temp_process_scenario() -> Scenario:
    """Encoded PowerShell from a temp folder, then C2 beacon (T1059.001)."""
    day = "2024-05-21"
    temp = "C:\\Users\\jsilva\\AppData\\Local\\Temp"
    steps = [
        ScenarioStep(
            delay_seconds=1.5,
            record=_process(
                _ts(day, "18:30:05"),
                "powershell.exe",
                "powershell.exe -nop -w hidden -enc SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQA",
                path=f"{temp}\\update.ps1",
            ),
        ),
        ScenarioStep(
            delay_seconds=1.5,
            record=_process(
                _ts(day, "18:30:35"),
                "rundll32.exe",
                f"rundll32.exe {temp}\\cache.dll,Start",
                path=f"{temp}\\cache.dll",
            ),
        ),
        ScenarioStep(
            delay_seconds=2.0,
            record=_network(
                _ts(day, "18:31:00"),
                destination="198.51.100.66",
                port=4444,
                process="powershell.exe",
            ),
        ),
        ScenarioStep(
            delay_seconds=1.5,
            record={
                "timestamp": _ts(day, "18:31:30"),
                "category": "file",
                "action": "file_create",
                "event_id": "11",
                "host": "WS-DEMO-01",
                "user": "jsilva",
                "ip": "198.51.100.20",
                "process": "powershell.exe",
                "path": f"{temp}\\stage.bin",
                "product": "windows",
            },
        ),
    ]
    return Scenario(
        id="temp-process",
        name="Suspicious process from a temp folder",
        description=(
            "PowerShell launched from the user temp folder with an encoded "
            "command line, then an outbound connection to a documented test "
            "IP on port 4444 (T1059.001 / T1071.001)."
        ),
        steps=tuple(steps),
        expected_rules=(
            "bs-proc-temp-folder-execution",
            "bs-proc-powershell-encoded-command",
            "bs-net-suspicious-outbound",
            "Suspicious_PowerShell_Commandline",
        ),
        expected_severity="critical",
        mitre=("T1059.001", "T1071.001", "T1105"),
    )


def log_clearing_scenario() -> Scenario:
    """Audit log cleared + tool invocation + evtx deletion (T1070.001)."""
    day = "2024-04-02"
    steps = [
        ScenarioStep(
            delay_seconds=1.5,
            record=_auth(
                _ts(day, "22:40:12"),
                "audit_clear",
                "1102",
                host="SRV-DEMO-02",
                user="admin.demo",
                ip="198.51.100.20",
                process="System",
                message="The audit log was cleared.",
            ),
        ),
        ScenarioStep(
            delay_seconds=2.0,
            record=_process(
                _ts(day, "22:40:40"),
                "wevtutil.exe",
                "wevtutil cl Security",
                host="SRV-DEMO-02",
                user="admin.demo",
                path="C:\\Windows\\System32\\wevtutil.exe",
            ),
        ),
        ScenarioStep(
            delay_seconds=2.0,
            record={
                "timestamp": _ts(day, "22:41:05"),
                "category": "file",
                "action": "file_delete",
                "event_id": "23",
                "host": "SRV-DEMO-02",
                "user": "admin.demo",
                "ip": "198.51.100.20",
                "process": "cmd.exe",
                "path": "C:\\Windows\\System32\\winevt\\Logs\\Security.evtx",
                "product": "windows",
            },
        ),
        ScenarioStep(
            delay_seconds=1.5,
            record=_process(
                _ts(day, "22:41:40"),
                "cmd.exe",
                "cmd.exe /c del C:\\Temp\\debug.log",
                host="SRV-DEMO-02",
                user="admin.demo",
                path="C:\\Windows\\System32\\cmd.exe",
            ),
        ),
    ]
    return Scenario(
        id="log-clearing",
        name="Audit log clearing",
        description=(
            "Windows event auditing disabled, the Security log cleared with "
            "wevtutil and the evtx file deleted - classic anti-forensics "
            "(T1070.001)."
        ),
        steps=tuple(steps),
        expected_rules=("bs-audit-log-cleared", "bs-file-evtx-deletion"),
        expected_severity="critical",
        mitre=("T1070.001", "T1070.004"),
    )


def sqli_scenario() -> Scenario:
    """SQL Injection patterns in web access logs (T1190) - detection only."""
    day = "2024-07-03"
    host = "WEB-DEMO-03"
    ip = "198.51.100.44"

    def web(ts: str, url: str, status: int, path: str = "/") -> dict:
        return {
            "timestamp": ts,
            "category": "web",
            "action": "http_request",
            "host": host,
            "user": "-",
            "ip": ip,
            "process": "nginx",
            "url": url,
            "path": path,
            "status": status,
            "product": "generic",
            "method": "GET",
        }

    steps = [
        ScenarioStep(delay_seconds=1.2, record=web(_ts(day, "09:15:00"), "/index.html", 200)),
        ScenarioStep(
            delay_seconds=1.5,
            record=web(_ts(day, "09:15:20"), "/products?id=1'%20OR%20'1'='1", 500, "/products"),
        ),
        ScenarioStep(
            delay_seconds=1.5,
            record=web(
                _ts(day, "09:15:35"),
                "/search?q=UNION%20SELECT%20username%20FROM%20users",
                500,
                "/search",
            ),
        ),
        ScenarioStep(
            delay_seconds=1.5,
            record=web(
                _ts(day, "09:15:50"),
                "/items?id=1;WAITFOR%20DELAY%20'0:0:5'",
                504,
                "/items",
            ),
        ),
        ScenarioStep(delay_seconds=1.2, record=web(_ts(day, "09:16:20"), "/about", 200, "/about")),
    ]
    return Scenario(
        id="sqli-web",
        name="SQL Injection patterns in web logs",
        description=(
            "Access log lines containing classic SQL Injection probes. The "
            "lab only *detects* the strings - nothing is sent or executed "
            "(T1190)."
        ),
        steps=tuple(steps),
        expected_rules=("bs-web-sql-injection", "Web_SQLi_Access_Log", "corr-sqli-burst"),
        expected_severity="critical",
        mitre=("T1190",),
    )


ALL_SCENARIOS: tuple[Scenario, ...] = (
    brute_force_scenario(),
    after_hours_scenario(),
    temp_process_scenario(),
    log_clearing_scenario(),
    sqli_scenario(),
)

SCENARIOS: dict[str, Scenario] = {scenario.id: scenario for scenario in ALL_SCENARIOS}


def get_scenario(scenario_id: str) -> Scenario | None:
    return SCENARIOS.get(scenario_id)


class ScenarioGenerator(BaseCollector):
    """Collector facade used by the API and the WebSocket runner."""

    def __init__(self, scenario_id: str) -> None:
        scenario = SCENARIOS.get(scenario_id)
        if scenario is None:
            raise KeyError(f"unknown scenario: {scenario_id}")
        self._scenario = scenario

    def scenario(self) -> Scenario:
        return self._scenario
