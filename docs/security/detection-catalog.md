# Detection Catalog — BLUE-SENTINEL Lab

Defensive-only catalogue of every rule loaded by the interactive detection lab
(`/lab`). All rules evaluate **synthetic** events produced by the scenario
generator (RFC 5737 documentation IPs, fictional hosts/users). Nothing in this
catalogue executes, exploits or sends anything — the SQL Injection strings, for
example, are only inspected inside log lines.

Rule roots (relative to the repository):

| Kind       | Directory      | Files |
|------------|----------------|-------|
| Sigma      | `rules/sigma/` | 8 `.yml` rules |
| YARA       | `rules/yara/`  | 2 `.yar` rules |
| Correlation | `rules/patterns/` | 2 `.yaml` patterns |

The engine (`backend/app/detection/engine.py`) evaluates every normalised
event against Sigma selections, scans the event free-text field with the YARA
collection once, then feeds the raw matches (including de-duplicated ones) to
the correlation engine. Details below; severity semantics live in
[`severity.md`](./severity.md).

## 1. Sigma rules

All rules share the common metadata required by the lab loader: `id`, `title`,
`status`, `logsource`, `detection`, `level`, `description`, `falsepositives`,
`response`, `references`, MITRE `tags` and the didactic `lab_samples`
(`match` / `no_match` records verified by the test suite).

| Rule ID | Title | Level | Logsource | Condition | MITRE | Scenario |
|---|---|---|---|---|---|---|
| `bs-auth-failed-logons` | Repeated Failed Logons for One Account | medium | windows / security / authentication_failure | `selection` | T1110.001 | brute-force |
| `bs-auth-logon-out-of-hours` | Successful Logon Outside Working Hours from a New Source | high | windows / security / authentication_success | `selection` | T1078, T1003 | after-hours-login |
| `bs-proc-temp-folder-execution` | Process Executed from a Temporary Folder | medium | windows / process_creation | `selection` | T1105, T1059 | temp-process |
| `bs-proc-powershell-encoded-command` | PowerShell Started With an Encoded Command | high | windows / process_creation | `selection and encoded` | T1059.001 | temp-process |
| `bs-net-suspicious-outbound` | Outbound Connection to a Non-Standard Port or Lab Range | critical | windows / network_connection | `selection and (nonstandard or lab_range)` | T1071.001 | temp-process |
| `bs-audit-log-cleared` | Windows Audit Log Cleared | critical | windows / security | `selection` | T1070.001 | log-clearing |
| `bs-file-evtx-deletion` | Windows Event Log File Deleted | high | windows / file_event | `selection` | T1070.004 | log-clearing |
| `bs-web-sql-injection` | SQL Injection Pattern in Web Access Log | high | web_access | `request and payload` | T1190 | sqli-web |

Each rule carries its own `falsepositives` and `response` lists, which are
surfaced verbatim in the educational explanation panel of the lab UI.

### Detection highlights

- `bs-auth-failed-logons` — failed interactive logons for one account; the
  first stage that the `corr-brute-force-sequence` pattern consumes.
- `bs-auth-logon-out-of-hours` — successful logon between 00:00–04:59 UTC
  (compared via the derived `hour` field) from a source never seen for the
  account.
- `bs-proc-powershell-encoded-command` — `selection and encoded` combines the
  process image (`powershell`) with `-enc` / `-EncodedCommand` arguments.
- `bs-net-suspicious-outbound` — outbound connection that is neither web nor
  DNS traffic, or whose destination is in the documented lab test range
  (RFC 5737 `198.51.100.0/24`, `203.0.113.0/24`).
- `bs-web-sql-injection` — request URI matching classic SQL Injection probes.
  The lab only inspects the log line; nothing is transmitted or executed.

## 2. YARA rules

| Rule | Meta ID | Level | MITRE | Strings / condition | Scenario |
|---|---|---|---|---|---|
| `Suspicious_PowerShell_Commandline` | `bs-yara-ps-encoded` | high | T1059.001 | `$exe and ($enc1 or $enc2) and ($hidden1 or $hidden2 or $hidden3)` — powershell + encoded/hidden arguments | temp-process |
| `Web_SQLi_Access_Log` | `bs-yara-sqli-access` | high | T1190 | `any of them` — `'1'='1`, `union select`, `waitfor delay`, `information_schema`, `sleep(` (plain and URL-encoded) | sqli-web |

Notes:

- The scanner (`backend/app/detection/yara_scanner.py`) supports `ascii`,
  `nocase`, `wide` and `fullword` string modifiers and the condition operators
  `and`, `or`, `not`, `any of them`, `all of them`, `N of them` and
  `N of ($a*, $b)`. When the native `yara-python` package is available it is
  used instead (reported as `yara_engine: yara-python` in the session report,
  otherwise `builtin`).
- YARA rules scan the event's concatenated `text` field (command line, path,
  URL, message), bounded to 8 192 characters per evaluation.

## 3. Correlation patterns

| Pattern ID | Title | Severity | Window | Group by | Stages | MITRE | Scenario |
|---|---|---|---|---|---|---|---|
| `corr-brute-force-sequence` | Brute force sequence ending in a successful logon | critical | 300 s | `host`, `user` | 1) `failed_logons`: ≥5 matches of `bs-auth-failed-logons`; 2) `success`: ≥1 `auth`/`logon` event | T1110.001, T1078 | brute-force |
| `corr-sqli-burst` | Burst of SQL Injection probes against one host | critical | 120 s | `host` | 1) `probes`: ≥3 matches of `bs-web-sql-injection` **or** `Web_SQLi_Access_Log` | T1190 | sqli-web |

Semantics (`backend/app/detection/correlation.py`):

- The window slides on the **simulated** event clock (not wall time), so
  pause/speed changes in the UI never break a pattern.
- Stages are ordered: stage *n* can only complete after stage *n−1* inside
  the window. State resets after a pattern fires.
- A stage is sourced by `rule_ids` (raw rule matches, including ones folded by
  de-duplication) and/or an `event` selection (`category`/`action` equality),
  combined with OR.
- Correlation alerts always open an incident (see `severity.md`).

## 4. Scenario ↔ expected rules

The session report compares what fired against these expectations
(`missing_rules` / `unexpected_rules`):

| Scenario | Events | Expected rules | Expected severity |
|---|---|---|---|
| `brute-force` | 6 failed logons 12 s apart + success + follow-ups | `bs-auth-failed-logons`, `corr-brute-force-sequence` | critical |
| `after-hours-login` | 03:14 logon from a new country + discovery commands | `bs-auth-logon-out-of-hours` | high |
| `temp-process` | PowerShell from `%TEMP%` with encoded command + outbound beacon | `bs-proc-temp-folder-execution`, `bs-proc-powershell-encoded-command`, `bs-net-suspicious-outbound`, `Suspicious_PowerShell_Commandline` | critical |
| `log-clearing` | auditing disabled → `wevtutil cl Security` → evtx deleted | `bs-audit-log-cleared`, `bs-file-evtx-deletion` | critical |
| `sqli-web` | access-log lines with SQL Injection probes | `bs-web-sql-injection`, `Web_SQLi_Access_Log`, `corr-sqli-burst` | critical |

## 5. Sigma subset implemented (and why)

The lab ships its **own** Sigma evaluator (`backend/app/detection/sigma_loader.py`)
instead of a third-party backend, because the lab must run offline with
pinned, auditable dependencies: every evaluation happens in-process, rules
hot-reload from disk (mtime check on each event + the UI's *Reload rules*
button) and a bad rule can never kill a session (per-loader errors are
captured and reported instead).

Supported Sigma surface:

| Feature | Supported |
|---|---|
| Top-level fields | `id`, `title`, `status`, `description`, `author`, `logsource`, `detection`, `level`, `tags`, `references`, `falsepositives`, plus lab extensions `response`, `lab_samples` |
| `logsource` | `product` (equality) and `category` (mapped: `authentication_success`, `authentication_failure`, `process_creation`, `network_connection`, `file_event`, `web_access`, …) and `service` recorded for display |
| Field modifiers | `contains`, `startswith`, `endswith`, `re`, `all`, `in`, `notin`, `cidr`, `gte`, `lte`, `gt`, `lt` and the flag `i` (case-insensitive), pipe syntax (`field\|contains\|i: value`) |
| `condition` | recursive descent with `and`, `or`, `not`, parentheses, `all of them`, `any of them`, `N of them`, `N of sel*` globs, plain selection names |
| Event matching | flat "sigma view" = top-level event keys merged with `fields` (top-level wins) |

Not implemented (out of scope for a synthetic lab): aggregate expressions
(`count()`, `near`), backends/pipelines, timeframes inside rules, and the full
`logsource` service matrix. Rules in `rules/sigma/` only use the supported
subset — CI and the unit tests enforce that every rule and `lab_samples`
record loads and matches as declared.

### Safety guards (ReDoS / latency)

- `redos_risk()` statically flags nested-quantifier regexes at load time;
  risky patterns are rejected with a per-rule error instead of evaluated.
- Regex sources longer than 500 characters are rejected; evaluated text is
  truncated to 8 192 characters.
- Each rule evaluation is timed against a 50 ms soft budget
  (`RULE_TIMEOUT_S`); exceedances are counted in `slow_evaluations` and
  exposed in the session report. Measured latency for the shipped scenarios
  stays sub-millisecond per event (well under the 1 s UI budget).

### MITRE ATT&CK validation

Techniques must match `T####` / `T####.###` **and** exist in the lab catalogue
`backend/app/detection/mitre.py` (12 techniques). A typo such as `T0000` fails
the rule at load time, so the UI never shows an unknown technique id.

## 6. Adding a rule

1. Create the file in the right directory (`rules/sigma/*.yml`,
   `rules/yara/*.yar`, `rules/patterns/*.yaml`).
2. Sigma rules need every required key listed in §5 — including
   `lab_samples.match` / `lab_samples.no_match`, `falsepositives` and
   `response` (the UI shows them) and MITRE `tags` restricted to the
   `mitre.py` catalogue.
3. Reload: the engine hot-reloads on file change, or press **Reload rules**
   in the lab UI (errors are reported per loader without dropping the session).
4. Cover the new rule in `backend/tests/unit/detection/` (loader validation,
   a `lab_samples` match/no-match test) and, if the rule belongs to a
   scenario, add it to that scenario's `expected_rules`.
