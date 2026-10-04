# Detection Catalog — BLUE-SENTINEL Lab

Defensive-only catalogue of every rule loaded by the interactive detection
lab (`/lab`) and by `scripts/development/validate_rules.py`. All rules
evaluate **synthetic** events produced by the scenario generator (RFC 5737
documentation IPs, fictional hosts and users). Nothing here executes,
exploits or sends anything — the SQL Injection and traversal strings are only
inspected *inside log lines*.

| Kind | Directory | Files | Fixtures |
|---|---|---|---|
| Sigma | `rules/sigma/{windows,linux,web,cloud}/` | **20** `.yml` | 20 positive + 20 negative |
| YARA | `rules/yara/` | **5** `.yar` | 5 positive + 5 negative |
| Correlation | `rules/patterns/` | 3 `.yaml` | covered by engine tests |

The engine (`backend/app/detection/engine.py`) evaluates every normalised
event against Sigma selections, scans the event free-text field with the YARA
collection once, then feeds the raw matches to the correlation engine.
Severity semantics live in [`severity.md`](./severity.md).

Every rule id in the tables below links to its file on GitHub when you open
the alert explanation panel in `/lab` (`source_url` is built from the rule's
path in this repository).

---

## 1. Sigma rules (20)

Common metadata required by the loader **and** by
`validate_rules.py`: `id` (canonical UUID, globally unique), `title`,
`lab_id` (kebab-case, equal to the file name), `status`, `description`,
`author` (`Pedro Lisboa`), `date` (`YYYY/MM/DD`), `references`,
`logsource`, `detection`, `level`, `falsepositives`, `response`, ATT&CK
`tags` and the didactic `lab_samples` (`match` / `no_match` records).

### 1.1 Windows (11)

| Rule | Objective | Log source | Level | Likely false positive |
|---|---|---|---|---|
| `bs-auth-failed-logons` | Flag repeated failed logons for one account — stage 1 of password guessing | Security 4625 (`authentication_failure`) | medium | Users mistyping passwords; service accounts with expired secrets |
| `bs-auth-rdp-external-logon` | Successful RDP logon (4624 type 10) from an IP never seen for that account | Security 4624 (`authentication_success`, enriched `new_source`) | high | A legitimate admin on a new VPN exit; remote-support vendors |
| `bs-win-member-added-local-admin` | Account added to a local Administrators-style group | Security 4732 | high | Documented workstation build / domain-join; helpdesk temporary elevation |
| `bs-win-service-installed` | Service registered (7045) from a user-writable path (`\temp\`, `\appdata\`, `\users\public\`) | System 7045 | high | Installers unpacking to `%TEMP%`; manually deployed agents |
| `bs-win-scheduled-task-created` | A new scheduled task is registered | Security 4698 | medium | Patch, backup and cleanup tasks during maintenance windows |
| `bs-audit-log-cleared` | Anti-forensics: Security log cleared, log clear recorded, or `.evtx` deleted | Security 1102, System 104, file delete on `*.evtx` | critical | Scheduled log rotation; golden-image builds |
| `bs-proc-powershell-encoded-command` | PowerShell started with `-enc` / `-EncodedCommand` / `-ec` | Process creation 4688 | high | Admin scripts encoding commands; endpoint-management agents |
| `bs-proc-temp-folder-execution` | Process started from a temp directory | Process creation 4688 | medium | Installers/updaters; developers building inside `%TEMP%` |
| `bs-win-office-spawned-shell` | Office application spawned cmd / powershell / wscript / mshta | Process creation 4688 (parent = winword/excel/powerpnt/outlook) | high | Outlook add-in integrations that legitimately open a shell |
| `bs-win-run-key-modified` | Value written to a Run/RunOnce-style autostart key | Sysmon 13 (`registry_value_set`) | medium | Software registering a legitimate autostart entry on install |
| `bs-net-suspicious-outbound` | Outbound connection on a non-web/DNS port **or** to the documented lab range | Network connection events | critical | Internal apps on uncommon ports; monitoring agents |

### 1.2 Linux (4)

| Rule | Objective | Log source | Level | Likely false positive |
|---|---|---|---|---|
| `bs-linux-ssh-failed-logons` | Rejected SSH password authentications — password guessing | `sshd` auth log (`service: sshd`) | medium | Passphrase typos behind a jump host; password scanners |
| `bs-linux-user-created-uid-zero` | Local account created with UID 0 (root-equivalent backdoor) | audit `user_created` with `uid: 0` | high | Golden images baking a rescue account (should not exist) |
| `bs-linux-crontab-modified` | Cron schedule written outside the standard directories | File event on `/etc/crontab`, `/etc/cron.d/`, `/var/spool/cron*` | medium | Admins editing schedules; Ansible/Puppet applying state |
| `bs-linux-sudo-unusual-account` | `sudo` used by an account outside the admin allowlist | `sudo` log, allowlist `user: root, deploy, backup` | high | A new operator not yet added to the allowlist |

### 1.3 Web (3)

| Rule | Objective | Log source | Level | Likely false positive |
|---|---|---|---|---|
| `bs-web-sql-injection` | Classic SQL Injection probe in the request URI (log line only — nothing is sent) | Web access log (`web_access`) | high | Authorised scanners; WAF test campaigns; canary probes |
| `bs-web-path-traversal` | Directory traversal sequence (`../`, `%2e%2e`, double-encoded) in the request URI | Web access log (`web_access`) | high | CMSes documenting nested paths; clients percent-encoding directories |
| `bs-web-scanner-user-agent` | User-Agent of a known vulnerability scanner/crawler | Web access log (`web_access`) | medium | Your own authorised scanning window; research crawlers |

### 1.4 Cloud (2)

| Rule | Objective | Log source | Level | Likely false positive |
|---|---|---|---|---|
| `bs-cloud-login-new-country` | Successful login from a country never seen for that identity (`new_country` enrichment) | Cloud identity/auth log | high | Employees travelling; migrated workloads with stale IdP data |
| `bs-cloud-access-key-created` | A new programmatic access key was issued | Cloud audit log (`access_key_created`) | high | Onboarding a new service/CI pipeline; planned key rotation |

---

## 2. YARA rules (5)

The five rules scan the lab's synthetic event free text
(`command_line` + `path` + `url` + `message` + `process` + `user` +
`detail`, capped at 8 192 characters). They are plain text patterns — **no
sample, payload or executable ships with this repository** (the EICAR rule
stores the test string as two halves so no file here triggers a real
antivirus product).

| Rule (file) | Objective | Source | Level | Likely false positive |
|---|---|---|---|---|
| `EICAR_Test_File` (`eicar-test-file.yar`) | Detects the anti-malware *test* string when both halves appear together | Event text | informational | Files created by vendors/testers to exercise tooling |
| `Office_Macro_AutoExec` (`office-macro-autoexec.yar`) | Office macro auto-execution entry point (`Auto_Open`, `Document_Open`, …) | Event text | medium | Organisations that legitimately ship macro-enabled templates |
| `Suspicious_Encoded_Chain` (`suspicious-encoded-chain.yar`) | PowerShell with an encoded command **and** hidden/temp context | Event text | high | Tooling that encodes commands to avoid quoting issues |
| `PHP_Webshell_Generic` (`php-webshell-patterns.yar`) | `<?php` combined with a dangerous execution/decoding function | Event text | high | Administrative scripts or installers that call those functions |
| `Phishing_Shortened_URL_Social` (`phishing-shorturl-social.yar`) | URL shortener + social platform domain in the same line | Event text | medium | Marketing messages that shorten social links |

Each file carries `meta`: `id` (`bs-yara-…`), `uuid`, `description`,
`author`, `date`, `level`, `mitre`, `false_positive` and `response` — all
enforced by the validator.

Notes:

- The scanner (`backend/app/detection/yara_scanner.py`) supports the `ascii`,
  `nocase`, `wide` and `fullword` string modifiers and the condition operators
  `and`, `or`, `not`, `any of them`, `all of them`, `N of them` and
  `N of ($a*, $b)`. When the optional native `yara-python` package is
  installed it replaces the built-in subset parser (reported as
  `yara_engine: yara-python` in the session report, otherwise `builtin`).

---

## 3. Correlation patterns (3)

Single-event rules cannot express "N of these in T seconds"; that is what
`rules/patterns/*.yaml` adds.

| Pattern | Objective | Window / threshold | Severity | MITRE |
|---|---|---|---|---|
| `corr-brute-force-sequence` | Brute force ending in a successful logon | 300 s, ≥5 `bs-auth-failed-logons` then 1 `logon`, grouped by `host`+`user` | critical | T1110.001, T1078 |
| `corr-sqli-burst` | Burst of SQL Injection probes against one host | 120 s, ≥3 `bs-web-sql-injection` matches, grouped by `host` | critical | T1190 |
| `corr-web-scan-404` | Directory/content discovery scan | 60 s, ≥20 HTTP 404 responses, grouped by `host` | medium | T1595.002 |

Semantics (`backend/app/detection/correlation.py`): windows slide on the
**simulated** event clock; stages are ordered and reset after a pattern
fires; a stage can be sourced by `rule_ids`, by an `event` selection, or
both (OR). Correlation alerts always open an incident.

---

## 4. Scenario ↔ expected rules

The session report compares what fired against these expectations
(`missing_rules` / `unexpected_rules`):

| Scenario | Expected rules | Expected severity |
|---|---|---|
| `brute-force` | `bs-auth-failed-logons`, `corr-brute-force-sequence` | critical |
| `after-hours-login` | `bs-auth-rdp-external-logon` | high |
| `temp-process` | `bs-proc-temp-folder-execution`, `bs-proc-powershell-encoded-command`, `bs-net-suspicious-outbound`, `Suspicious_Encoded_Chain` | critical |
| `log-clearing` | `bs-audit-log-cleared` | critical |
| `sqli-web` | `bs-web-sql-injection`, `corr-sqli-burst` | critical |

The other 13 Sigma rules and 4 YARA rules are exercised by the fixture
corpus (`backend/tests/fixtures/detection/`) rather than by a UI scenario.

---

## 5. Validation, fixtures and hit-rate

`scripts/development/validate_rules.py` is the single gate for the library.
It is deliberately a small, readable script rather than a pySigma run or a
JSON Schema file: pySigma checks Sigma *syntax* but not this library's
contract (file name ↔ `lab_id`, UUID uniqueness across files, techniques
inside the engine catalog, fixtures that really fire), and JSON Schema cannot
express those cross-file/cross-field rules at all. The script reuses the
lab's own loaders for syntax — the exact code path the engine runs — and
writes the metadata rules out explicitly.

```bash
python scripts/development/validate_rules.py        # validate + measure hit-rate
python scripts/development/validate_rules.py -v     # per-fixture verdicts
python scripts/development/validate_rules.py --write-docs  # refresh ATT&CK matrix
```

It checks, for **every** rule:

1. **Schema** — all required fields present, `status` in the Sigma vocabulary,
   `date` in `YYYY/MM/DD`, `level` in the severity scale, `logsource` and
   `detection.condition` usable.
2. **Identity** — `id`/`uuid` parse as canonical UUIDs and are unique across
   the whole library; `lab_id` is kebab-case and equal to the file name.
3. **ATT&CK** — every `attack.tXXXX` tag parses and exists in
   `backend/app/detection/mitre.py`, with a tactics mapping for the matrix.
4. **Specificity** — `falsepositives` is non-empty and cannot be a placeholder
   (`n/a`, `none`, …); `references` are URLs; `response` has content.
5. **Engine load** — the rule is compiled with the *same* loaders the lab
   uses (`load_sigma_rule` / `load_yara_rule` / `load_pattern`), so syntax,
   modifiers and ReDoS guards are covered.
6. **Fixtures** — exactly one positive and one negative fixture per rule,
   well-formed, normalisable, and the positive one's `expect` list is correct.
7. **Hit-rate** — every fixture is replayed through the full pipeline
   (normalise → Sigma → YARA). The current corpus scores
   **50/50 = 100 %**; anything lower fails CI.
8. **Coverage matrix** — the generated block in
   [`attack-coverage.md`](./attack-coverage.md) must match the rules.

CI runs it as a dedicated job (`detection rules`) and again through pytest
(`tests/unit/detection/test_validator.py`).

### Fixture format

```json
{
  "description": "positive fixture for bs-web-sql-injection",
  "kind": "sigma",
  "rule": "bs-web-sql-injection",
  "expect": ["bs-web-sql-injection"],
  "event": { "timestamp": "2025-06-01T12:00:00Z", "category": "web", "...": "..." }
}
```

Positive fixtures must fire **exactly** `expect`; negative fixtures must fire
nothing at all (checked across the whole library, so tuning one rule cannot
quietly break another).

---

## 6. Sigma subset implemented (and why)

The lab ships its **own** Sigma evaluator (`backend/app/detection/sigma_loader.py`)
instead of a third-party backend: the lab must run offline with pinned,
auditable dependencies, every evaluation happens in-process, rules hot-reload
from disk (mtime check plus the UI's *Reload rules* button) and a bad rule can
never kill a session (loader errors are captured per rule). Rules stay plain
Sigma YAML, so they remain consumable by pySigma/Sigma CLI later.

| Feature | Supported |
|---|---|
| Top-level fields | `id`, `title`, `status`, `description`, `author`, `date`, `references`, `logsource`, `detection`, `level`, `tags`, `falsepositives`, plus lab extensions `lab_id`, `response`, `lab_samples` |
| `logsource` | `product` (equality), `category` (mapped: `authentication_success`, `authentication_failure`, `process_creation`, `network_connection`, `file_event`, `web_access`), `service` recorded for display |
| Field modifiers | `contains`, `startswith`, `endswith`, `re`, `all`, `in`, `notin`, `cidr`, `gte`, `lte`, `gt`, `lt` and the flag `i` (case-insensitive), pipe syntax (`field\|contains\|i: value`) |
| `condition` | recursive descent with `and`, `or`, `not`, parentheses, `all of them`, `any of them`, `N of them`, `N of sel*` globs and plain selection names |
| Event matching | flat "sigma view" = top-level event keys merged with `fields` (top level wins) |

Not implemented (out of scope for a synthetic lab): aggregate expressions
(`count()`, `near`), backends/pipelines, timeframes inside rules and the full
`logsource` service matrix. CI and the unit tests enforce that every rule and
every `lab_samples` record loads and matches as declared.

### Safety guards (ReDoS / latency)

- `redos_risk()` statically flags nested-quantifier regexes at load time;
  risky patterns are rejected with a per-rule error instead of evaluated.
- Regex sources longer than 500 characters are rejected; evaluated text is
  truncated to 8 192 characters.
- Each rule evaluation is measured against a 50 ms soft budget
  (`RULE_TIMEOUT_S`); exceedances are counted in `slow_evaluations` and shown
  in the session report. The shipped scenarios stay sub-millisecond per event.

### MITRE ATT&CK validation

Technique ids must match `T####` / `T####.###`, exist in
`backend/app/detection/mitre.py` (**24 techniques**, mapped to the 14
enterprise tactics) and carry a tactics entry used by the generated matrix.
A typo such as `T0000` fails the rule at load time, so the UI never shows an
unknown technique. See [`attack-coverage.md`](./attack-coverage.md) for the
matrix and the declared gaps.

---

## 7. Adding a rule

1. Create the file in the right directory with a **kebab-case** name equal to
   `lab_id` (`rules/sigma/<platform>/bs-….yml`, `rules/yara/bs-….yar`).
2. Sigma: fill every required field from §1 — including `lab_samples.match` /
   `lab_samples.no_match`, a specific `falsepositives` list, a `response`
   playbook and MITRE `tags` restricted to the `mitre.py` catalog. YARA: the
   `meta` block listed in §2.
3. Add `positive/<lab_id>.json` and `negative/<lab_id>.json` fixtures
   (copy a neighbour; positive fixtures also declare `"expect"`).
4. Run `python scripts/development/validate_rules.py` — fix anything it flags,
   then `--write-docs` if you introduced a new technique.
5. Reload: the engine hot-reloads on file change, or press **Reload rules**
   in the lab UI (errors are reported per loader without dropping the session).
6. If the rule belongs to a scenario, add it to that scenario's
   `expected_rules` and to `tests/unit/detection/test_rules.py`'s id list.
