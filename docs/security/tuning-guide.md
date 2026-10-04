# Tuning Guide — BLUE-SENTINEL Detection Rules

How to reduce false positives without gutting a detection. Every rule in
`rules/` already documents its known false positives in `falsepositives` and
the first response step in `response`; this guide explains the *mechanics*
available in this repository and the workflow that keeps tuning safe.

Scope: defensive only. Nothing here executes, exploits or sends anything —
SQL Injection and traversal strings are only inspected inside log lines.

---

## 1. Principles

1. **Measure before you tune.** A rule that never fired is not noisy; you
   have no evidence yet. Collect a baseline window first.
2. **Narrow, never disable.** An allowlisted account or a raised threshold
   keeps the detection alive for the adversary who does *not* use your
   allowlisted identity. Turning a rule off removes the evidence trail.
3. **Tune with the fixtures as a regression suite.** Every rule ships a
   positive and a negative fixture under
   `backend/tests/fixtures/detection/{positive,negative}/`. If your change
   makes the positive fixture stop matching, the rule got weaker than the
   behaviour it claims to detect.
4. **Record the reason.** Put the allowlist entry or the threshold change in
   the rule's `falsepositives` list (and in a comment-worthy description), not
   in someone's head.
5. **Context beats condition.** Host role, change window and source identity
   explain more alerts than another regex alternative.

## 2. The verification loop

```bash
# 1. edit the rule (or the correlation pattern)
# 2. re-run the fixtures + validator: hit-rate must stay 100%
python scripts/development/validate_rules.py -v
cd backend && python -m pytest tests/unit/detection -q
# 3. refresh the ATT&CK matrix if you added/retagged a technique
python scripts/development/validate_rules.py --write-docs
```

`validate_rules.py` fails (exit 1) when a positive fixture stops firing, when
a negative fixture starts firing, when a required field disappears or when
the generated coverage matrix in `attack-coverage.md` is stale. CI runs the
same script, so a badly tuned rule cannot be merged quietly.

When tuning *intentionally* widens a rule (e.g. you add a new allowlisted
value to a `notin` list), update the corresponding fixture in the same commit
so the test suite keeps describing real behaviour.

## 3. Tuning levers available in this repository

| Lever | Where | Effect | Cost |
|---|---|---|---|
| Log-source scope | `logsource:` (`product`, `service`, `category`) | Only events from the intended channel reach the rule | Missing channel = silent no-detect; document it |
| Field allowlist (`notin`) | `detection:` selections, e.g. `user\|notin` | Excludes known-good accounts/IPs from the match | Allowlisted identity abused by an attacker → missed; keep the list short and reviewed |
| Field requirement (extra selection) | `condition: selection and extra` | Raises the bar from "this happened" to "this happened in a suspicious context" | Extra telemetry must exist in the event |
| Regex/value tightening | `path\|contains`, `url\|re`, `port\|notin` | Fewer benign strings match | Easy to over-fit; validate with the positive fixture |
| Correlation window / count | `window_seconds`, `min_events` in `rules/patterns/*.yaml` | Turns a noisy single event into a "N in T" signal | Too large a window hides slow attacks; too small re-introduces noise |
| Severity re-ranking | `level:` | Moves the alert out of the on-call queue without losing the signal | Use last; noisy-but-critical is still critical |
| Negative fixture | `backend/tests/fixtures/detection/negative/*.json` | Locks the tuned behaviour in a regression test | None — always do this |

The lab additionally exposes every rule's `falsepositives` and `response`
verbatim in `/lab` (explanation panel), so tuning decisions are visible to
whoever triages the alert next.

## 4. Per-rule tuning notes

### Windows (Security / Sysmon / process creation)

| Rule | Typical false positive source | Tuning action |
|---|---|---|
| `bs-auth-failed-logons` | Users mistyping passwords, service accounts with expired secrets, availability tests | Keep it at `medium` and let `corr-brute-force-sequence` (≥5 in 300 s per `host`+`user`) raise the alert. Allowlist scanner/monitoring accounts in the selection instead of filtering alerts downstream |
| `bs-auth-rdp-external-logon` | Admins on a new VPN exit, remote-support vendors | Seed the `new_source` enrichment with corporate VPN/egress ranges; require a second signal (out-of-hours, new country) before paging |
| `bs-win-member-added-local-admin` | Workstation build / domain-join scripts, helpdesk temporary elevation | Allowlist the build automation identity and the change window; extend `target_group` only for groups you actually administer |
| `bs-win-service-installed` | Installers unpacking into `%TEMP%`, RMM/endpoint agents deployed by hand | Allowlist signed vendor paths or a known service account as creator; keep `\temp\`, `\appdata\`, `\users\public\` as the writable-path core |
| `bs-win-scheduled-task-created` | Patching, backup and cleanup tasks | Add a creator allowlist (`created_by\|notin`) or suppress inside the maintenance window; escalate to `high` only for tasks created by non-admin users |
| `bs-audit-log-cleared` | Scheduled log rotation, golden-image builds | Exclude the image-build pipeline host/time explicitly; never allowlist "all rotation" — an attacker clears logs the same way |
| `bs-proc-powershell-encoded-command` | Admin scripts that encode commands to dodge quoting, endpoint-management agents | Require a suspicious parent or a temp path as a second selection for paging; keep the raw detection at `high` for hunting |
| `bs-proc-temp-folder-execution` | Installers/updaters, developers building from `%TEMP%` | Narrow `\temp\` to `\appdata\local\temp\` if your fleet splits user/system temp; exclude `msiexec`/updater parents |
| `bs-win-office-spawned-shell` | Outlook add-ins launching a shell, "open terminal here" integrations | Allowlist the specific parent→child pairs; add Mark-of-the-Web/origin context when the collector provides it |
| `bs-win-run-key-modified` | Software registering a legitimate autostart entry on install | Allowlist installer parents (`msiexec.exe`, vendor setup) writing to a vendor key; requires Sysmon 13 — verify the channel before tuning |
| `bs-net-suspicious-outbound` | Internal apps on uncommon ports, monitoring agents | Add approved business ports to `port\|notin`, scope by asset role, and always keep the `lab_range` CIDR branch |

### Linux (sshd / sudo / cron / accounts)

| Rule | Typical false positive source | Tuning action |
|---|---|---|
| `bs-linux-ssh-failed-logons` | Passphrase typos behind a jump host, scanners testing passwords | Keep one event = one `medium` signal; suppress known scanner source IPs at the logsource (fail2ban already knows them); let the correlation pattern decide severity |
| `bs-linux-sudo-unusual-account` | A new operator not yet added, responders using an unmanaged account | The allowlist lives **in the rule**: `user\|notin [root, deploy, backup, -]`. Add operators there (and to `falsepositives`), never remove the field |
| `bs-linux-crontab-modified` | Admins editing schedules, Ansible/Puppet applying state | Allowlist the configuration-management user and the automation paths it owns; keep `/var/spool/cron*` covered |
| `bs-linux-user-created-uid-zero` | Golden images baking a rescue account (should not happen) | Exclude image-build hosts/time only; in production this stays `high` with no allowlist |

### Web (access logs)

| Rule | Typical false positive source | Tuning action |
|---|---|---|
| `bs-web-sql-injection` | Your authorised scanners, WAF test campaigns, canary probes | Suppress by scanner source IP or by the maintenance window; consider ignoring requests already blocked by the WAF (`status: 403`) once that field is collected |
| `bs-web-path-traversal` | CMSes documenting nested paths, clients percent-encoding directories | Keep the encoded variants (`%2e%2e`, `%252e%252e`) — that is the attack surface; exclude your own crawler paths rather than weakening the pattern |
| `bs-web-scanner-user-agent` | Your own signed penetration test, research crawlers identifying themselves | Calendar-based suppression for scheduled scans plus a source-IP allowlist; extend the UA list as new tools appear (it is a maintenance item, not a bug) |

### Cloud

| Rule | Typical false positive source | Tuning action |
|---|---|---|
| `bs-cloud-login-new-country` | Employees travelling, migrated workloads with a stale identity provider | Seed known countries/VPN egress into the `new_country` enrichment; exclude service identities entirely (they should not log in interactively) |
| `bs-cloud-access-key-created` | Onboarding a new service/CI pipeline, planned key rotation | Allowlist the CI/CD identity and the rotation window; keep human identities at `high` with no exception |

### YARA (event text scanning)

| Rule | Condition | Tuning action |
|---|---|---|
| `EICAR_Test_File` | `all of them` (both halves present) | Informational by design. If it fires outside a test harness, the question is provenance, not the rule |
| `Office_Macro_AutoExec` | `any of them` (5 macro entry points) | Add a second requirement (suspicious API call, document from the internet zone) before paging; keep the broad form for hunting |
| `Phishing_Shortened_URL_Social` | `any of ($short*) and any of ($social*)` | Require the pair inside a message/mail-gateway event rather than any log line; marketing calendars are the classic FP |
| `PHP_Webshell_Generic` | `$tag and any of ($danger*)` | Raise to `2 of ($danger*)` when `base64_decode(`-only installers flood you; never drop `$tag` |
| `Suspicious_Encoded_Chain` | powershell + `-enc` + (hidden or temp) | Add a parent-process or signer condition for paging; the three-part condition already exists to keep FP low |

### Correlation patterns (`rules/patterns/*.yaml`)

- `window_seconds` is the primary noise dial: 300 s for brute force, 120 s
  for SQL Injection bursts, 60 s for a 404 scan.
- `min_events` is the sensitivity dial: raising `failed_logons` from 5 to 10
  delays the alert but tolerates noisier accounts; lowering it below ~3 makes
  the pattern fire on ordinary typos.
- `group_by` decides blast radius: `[host, user]` for brute force (per
  account), `[host]` for web attacks (per target).
- Windows slide on the **simulated** event clock, so pause/speed in the UI
  never breaks a pattern; in production they slide on event time.

## 5. Host and identity context (the cheapest FP reduction)

Before touching a condition, check whether the alert can be explained by
context the collector already has:

- **Asset role** — build servers, jump hosts and monitoring probes are
  *supposed* to do odd things; tag them and scope the rule, don't delete it.
- **Change window** — maintenance events are scheduled; correlate alerts with
  the change calendar instead of suppressing a whole rule for the day.
- **Identity class** — service/CI identities should never produce interactive
  logons or new access keys; excluding them from *interactive* detections
  removes FP and adds a real detection (unexpected service-account use).
- **Known sources** — VPN egress, office NAT and authorised scanner IPs
  belong in enrichment, not in a rule negation list that nobody reviews.

## 6. Anti-patterns (what not to do)

- Deleting a rule because it fired during a deployment.
- Adding an entire `/24` to `notin` because one host was noisy.
- Weakening a regex (dropping `%2e%2e`, dropping `-enc `) instead of scoping
  the source that produced the benign match.
- Changing `level` to `informational` and calling it tuned — the alert still
  costs someone a look; fix the source of the noise.
- Tuning without a negative fixture: next time the same FP returns and
  nobody remembers why the rule was edited.

## 7. Pre-flight checklist for a new deployment

1. Log channels present: Windows Security (4624/4625/4698/4732/1102),
   System (7045/104), process creation (4688), Sysmon (13 registry,
   network connection), `sshd`/`sudo`/cron on Linux, web access logs,
   cloud identity/audit logs.
2. Enrichment available: `new_source`, `new_country`.
3. Baseline captured (one week minimum) before alerting on `medium`.
4. Fixtures green: `python scripts/development/validate_rules.py`.
5. Every allowlist change committed together with its `falsepositives` note
   and a negative fixture.

## Related reading

- Rule-by-rule catalogue: [`detection-catalog.md`](./detection-catalog.md)
- What is (and is not) covered: [`attack-coverage.md`](./attack-coverage.md)
- Severity semantics: [`severity.md`](./severity.md)
