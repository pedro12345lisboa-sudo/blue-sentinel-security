# Incident Response Methodology — BLUE-SENTINEL

How a Blue-Sentinel alert becomes a handled incident: the lifecycle used by
the six playbooks in `frontend/content/{pt,en}/playbooks/`, the triage and
escalation rules, evidence handling, communication and the metrics the
portfolio tracks. Based on NIST SP 800-61 Rev. 2 (incident handling life
cycle) and MITRE ATT&CK for technique references.

Scope: defensive and educational. Nothing here executes, exploits or sends
anything; every step reads telemetry already collected by the detection
pipeline.

---

## 1. Life cycle

NIST SP 800-61 Rev. 2 defines four phases. Blue-Sentinel keeps the first
(preparation) as a standing condition and implements the other three as
explicit playbook sections:

| NIST phase | Where it lives in this repo |
|---|---|
| Preparation | `rules/` library, lab scenarios (`backend/app/collectors/scenario_generator.py`), severity model (`docs/security/severity.md`) |
| Detection & analysis | Alerting rules + triage questions (`triage:` in each playbook frontmatter) |
| Containment, eradication & recovery | `phases:` and `checklist:` sections of each playbook |
| Post-incident activity | `lessons:` section of each playbook, `docs/security/tuning-guide.md` for detection feedback |

Detection without a documented next step is half the work: every playbook is
written so that the page itself is the runbook the analyst follows while the
case is open.

## 2. Playbook catalogue

| # | Playbook | Severity | Type | Lab scenario |
|---|---|---|---|---|
| 1 | Credential attack (brute force / password spraying) | high | `credentials` | `brute-force` |
| 2 | Reported phishing | medium | `phishing` | `after-hours-login` |
| 3 | Suspected endpoint malware | high | `malware` | `temp-process` |
| 4 | Ransomware indicators (containment first) | critical | `ransomware` | `log-clearing` |
| 5 | Suspicious privileged account creation | high | `privileged-account` | `after-hours-login` |
| 6 | Suspected data exfiltration | critical | `exfiltration` | `temp-process` |

Each playbook page carries, in its frontmatter, the rules that trigger it
(`trigger.rules[]`), so the link between *detection* and *response* is a file
path, not a sentence. Rule ids resolve to `rules/sigma/**`, `rules/yara/**` or
`rules/patterns/**` and are rendered as links to the repository file.

Shared structure of every playbook:

1. **Trigger** — the rule or user report that opens the case.
2. **Severity** — same scale as the alert model (`docs/security/severity.md`).
3. **Data sources** — where the analyst looks first.
4. **Triage questions** — rendered as an interactive checklist; answering
   them decides which branch of the decision tree applies.
5. **Decision tree** — Mermaid `flowchart TD`, rendered client-side with a
   plain `<pre>` fallback (also what appears on paper).
6. **Containment → eradication → recovery** — NIST phases, each with a
   summary plus an executable checklist.
7. **Evidence to preserve** — chain of custody items captured *before* any
   cleanup.
8. **Communication** — who is notified and when.
9. **Metrics** — MTTD and MTTR targets.
10. **Lessons learned** — the feedback loop into rules and process.

## 3. Triage and escalation

Triage answers two questions in order: *is this real?* and *is the adversary
still inside?* The decision trees share that shape:

```
alert → is access/conversion confirmed? → scope (single host / domain / cloud)
      → contain → eradicate → recover → monitor
```

Escalation from *alert* to *incident* follows the same rule as the detection
engine (`backend/app/detection/engine.py`): a correlation alert or any alert
at `high` severity or above opens an incident. Playbooks add content-specific
triggers, for example:

- **Credentials:** any successful logon after the failure sequence.
- **Phishing:** credential typed, or code executed from the attachment.
- **Malware:** persistence present, or the same signature on a second host.
- **Ransomware:** treated as an incident on first confirmation of encryption
  or of a ransom note — never waits for scope confirmation.
- **Privileged account:** creation without a matching change ticket *and* a
  subsequent logon.
- **Exfiltration:** outbound volume with no approved change window, or
  access from a never-seen location.

Anything below those thresholds stays an alert with a documented disposition
(allowlist entry, tuning change or support ticket), never a silent close.

## 4. Evidence and chain of custody

Rules of thumb implemented in the `evidence:` sections:

1. **Collect before cleanup.** Process tree, event logs and file hashes are
   exported before removal, isolation teardown or restore.
2. **Export with time zone.** Every export records date, time and offset;
   retention windows are the enemy of the timeline.
3. **Preserve the original artefact.** Mail as `.eml`, binaries by SHA-256,
   ransom notes as files — the sample is never re-saved in place.
4. **Record who did what.** Containment actions (block, freeze, isolate)
   carry actor, tool and timestamp.
5. **Keep volatile state.** For ransomware and malware the running machine is
   captured before full isolation; powering off destroys the origin of the
   vector.
6. **Correlate by ticket.** The case id links this evidence to every other
   detection on the same campaign.

## 5. Communication

Each playbook lists `when` / `who` pairs. The defaults are:

| Moment | Audience |
|---|---|
| First confirmation of a possible incident | Response owner + system/account owner |
| Confirmed compromise or scope beyond one host | Management of the affected area, infrastructure, security |
| Personal data or regulated data involved | Data protection officer (LGPD), legal, executive team |
| Case closure | Audit and the formal lessons-learned channel |

Notification content is factual: what happened, what was contained, what is
still unknown, and the next checkpoint time. Speculation and attribution are
not part of incident communication.

## 6. Metrics

| Metric | Definition | Targets by playbook |
|---|---|---|
| MTTD | Alert timestamp → first triage action | 5–15 min (ransomware 5, phishing 10) |
| MTTR | Alert timestamp → containment complete | 30 min (privileged account) → 4 h (phishing, malware) |

Both are measured from the alert, not from ticket creation: the clock starts
when the telemetry fired. Post-incident review compares actual values against
the playbook target and records the delta in `lessons:`.

## 7. From hunt to permanent detection

Threat hunting hypotheses (`frontend/content/{pt,en}/hunting/`) are the
supply line for new rules. Each one documents:

1. **Hypothesis** — a falsifiable statement about adversary behaviour.
2. **ATT&CK technique** — the reference that keeps coverage measurable.
3. **Data source** and **pseudocode query** — read-only over collected logs.
4. **What normal looks like** — the baseline that prevents a noisy rule.
5. **Escalation criterion** — when the query output becomes an incident.
6. **Path to Sigma** — how the query turns into a permanent rule with
   threshold, allowlist (`notin`) and a positive/negative fixture pair.

A hypothesis graduates into `rules/sigma/**` only after
`python scripts/development/validate_rules.py -v` passes with both fixtures
(see `docs/security/tuning-guide.md`). Until then it stays a query run on a
schedule — never an alert nobody owns.

## 8. Verification loop

```bash
# rules referenced by the playbooks still exist and validate
python scripts/development/validate_rules.py -v
cd backend && python -m pytest tests/unit/detection -q

# content + UI
cd frontend && npm run check:i18n && npm run type-check && npm run test
```

## References

- NIST SP 800-61 Rev. 2 — *Computer Security Incident Handling Guide*
- NIST SP 800-34 Rev. 1 — *Contingency Planning Guide for Federal Information Systems*
- NIST SP 800-53 Rev. 5 — *AC-2 Account Management*
- MITRE ATT&CK — https://attack.mitre.org/
- CISA #StopRansomware Guide (containment-first sequencing)
- LGPD (Lei 13.709/2018) — incident communication duties
