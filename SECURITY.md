# Security Policy

## Supported versions

This is a personal portfolio deployed from `main`. The latest commit on `main` is the only
supported version; fixes are delivered by deploy (tag-based, see
[docs/architecture/runbook.md](docs/architecture/runbook.md)).

| Version | Supported |
|---|---|
| `main` (latest tag) | ✅ |
| older tags / forks | ❌ |

## Reporting a vulnerability

**Please do not report security issues through public GitHub issues.**

Use one of the private channels below:

1. **GitHub Security Advisories** — *Security* tab → *Report a vulnerability* on this repository (preferred).
2. **E-mail** — the security contact configured via `NEXT_PUBLIC_SECURITY_EMAIL`
   (placeholder in the repository: `[SEU EMAIL]`).

Include as much of the following as you can:

- Description of the issue and its impact
- Steps to reproduce (PoC URLs, requests, screenshots)
- Affected component (`frontend/`, `backend/`, `agent/`, infrastructure)
- Your assessment of severity (CVSS if you have it)

### What to expect

| Stage | Target |
|---|---|
| Acknowledgement | within **72 hours** |
| Initial triage / severity | within **7 days** |
| Fix or mitigation plan for critical/high | within **30 days** |
| Disclosure | coordinated — fix lands first, advisory/public write-up after |

You will receive status updates on the report. If a target is missed, ping the same channel —
missed deadlines are a bug in the process, not a reason to go public early.

### Safe harbor

Good-faith research on this project is authorized **when you**:

- Only test against the **publicly deployed site** or your **local copy** — never third-party
  infrastructure, user devices, or accounts that are not yours;
- Avoid privacy violations, data destruction, spam, and any action that degrades availability
  for other users (no load/stress testing beyond a few manual requests);
- Use **synthetic data only** — never exfiltrate or retain real personal data from the contact
  form or logs; delete anything you incidentally observe and report it;
- Report findings promptly and keep them confidential until a fix or coordinated disclosure.

We will not pursue legal action against research conducted within these bounds, and we credit
reporters who want it (in the advisory and, if you wish, in the README acknowledgements).

### Out of scope

- Social engineering of the site owner or third parties
- Physical attacks, vishing, or requests to test third-party services (Cloudflare, GitHub, e-mail providers)
- Automated scanner output without a verified reproduction path
- Findings in dependencies already disclosed publicly without an exploitable path to this app
- The synthetic lab payloads/rules themselves (they are, by design, detection content)

### Non-security bugs

Functional bugs, typos and content issues: use regular GitHub issues
(see [CONTRIBUTING.md](CONTRIBUTING.md)).

## Deployment & infrastructure baseline

The implemented hardening baseline (network segmentation, non-root containers, secrets handling,
rate limiting, backups, headers) is documented in
[docs/security/hardening.md](docs/security/hardening.md); the threat model lives in
[docs/security/threat-model.md](docs/security/threat-model.md). Deviation from those documents
is considered a finding.
