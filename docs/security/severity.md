# Severity Model — BLUE-SENTINEL Lab

How severity is assigned to alerts, how incidents open and escalate, and how
the session report grades the run. Implemented in
`backend/app/detection/severity.py` (scale), `backend/app/detection/engine.py`
(alerts/incident) and surfaced in the lab UI via
`docs/security/detection-catalog.md` rules.

## 1. The scale

```
informational < low < medium < high < critical
```

- Canonical names are normalised case-insensitively (`"HIGH"` → `high`);
  anything else raises `SeverityError` and is rejected at rule-load time.
- `rank(level)` gives the numeric position; `max_severity([...])` returns the
  most severe entry (empty input → `informational`); `at_least(level, t)`
  compares against a threshold.
- The API serialises the raw name plus a `severity_label` (`Critical`, `High`, …);
  the UI localises the same keys (`pages.lab.severity.*` in
  `frontend/messages/pt-BR.json` / `en.json`).

## 2. Alert severity

An alert's severity is the severity of the rule that produced it:

| Source | Severity comes from |
|---|---|
| Sigma rule | `level:` in the YAML (validated on load) |
| YARA rule | `meta: level` |
| Correlation pattern | `severity:` in the pattern YAML |

Multiple rules matching the same event each produce their own alert (subject
to de-duplication, §3). Severity never changes after the alert is emitted;
only the **incident** severity escalates (§4).

## 3. De-duplication (simulated clock)

Alerts with the same key `(rule_id, host, user)` inside a **120 s simulated
window** (`DEDUP_TTL_SECONDS`) fold into the first alert instead of flooding
the console:

- The existing alert's `count` increases silently.
- The suppressed match is counted in `suppressed` (session statistics and
  report) but no new alert message is sent.
- Correlation patterns deliberately consume the **raw** matches (before
  de-duplication), so a burst still completes its stages.

The window is measured on the event timestamps (simulated time), so pausing
or changing playback speed in the UI never affects de-duplication.

## 4. Incidents

An incident opens automatically the first time an alert satisfies:

```
kind == "correlation"  OR  severity >= "high"   (INCIDENT_THRESHOLD)
```

Behaviour:

- **Opening** — the incident is created with the scenario title/description,
  `opened_by` (the triggering rule id) and a timeline that backfills every
  alert emitted before it opened.
- **Escalation** — each subsequent alert raises the incident severity to
  `max(current, alert.severity)` and merges MITRE techniques, response steps
  and false-positive notes (deduplicated, order preserved).
- **Timeline entries** — `{ts, kind, ref, text, severity}` where `kind` is
  `sigma`, `yara`, `correlation`, `incident_opened` or `incident_closed`.
- **Closing** — when the scenario finishes, `complete()` sets `status: closed`
  and appends the `incident_closed` entry ("incident handed to the analyst").
- Alerts below the threshold of a non-correlation kind (e.g. a lone `medium`)
  are reported but do not open an incident.

## 5. Session report grading

At completion the engine builds the report consumed by the UI:

| Field | Meaning |
|---|---|
| `final_severity` | `max_severity` over every emitted alert |
| `expected_severity` | the scenario's declared expectation |
| `rules_fired` | sorted unique rule ids that produced at least one alert |
| `expected_rules` | the scenario's expected rule ids |
| `missing_rules` | expected but never fired (should be empty for a healthy lab) |
| `unexpected_rules` | fired but not expected (extra context, not a failure per se) |
| `alerts` / `suppressed` | emitted vs folded by de-duplication |

The UI shows `final_severity` and `expected_severity` side by side with a
"matches expectations" badge when they are equal.

### Expected outcomes of the shipped scenarios

| Scenario | Expected severity | Incident opened by |
|---|---|---|
| `brute-force` | critical | `corr-brute-force-sequence` (correlation) — Sigma failures alone are `medium` |
| `after-hours-login` | high | `bs-auth-logon-out-of-hours` (`high`) |
| `temp-process` | critical | `bs-net-suspicious-outbound` (`critical`) / encoded PowerShell (`high`) |
| `log-clearing` | critical | `bs-audit-log-cleared` (`critical`) |
| `sqli-web` | critical | `corr-sqli-burst` (correlation) |

## 6. Latency budget

Detection runs synchronously per event in the session runner: Sigma
evaluations are individually timed (50 ms soft budget, see the ReDoS section
of the catalogue), YARA scans the text once per event, correlation is an
in-memory window lookup. The UI budget is **< 1 s from event to alert**;
measured processing for the shipped scenarios is sub-millisecond per event
(`max_process_ms` is reported in the session summary).
