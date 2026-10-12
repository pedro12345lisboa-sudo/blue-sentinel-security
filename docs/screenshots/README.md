# Screenshots — capture guide & checklist

How to capture the keystone screenshots for the root `README.md` (and for
social/link previews) with a reproducible setup. Save every file in **this
folder** (`docs/screenshots/`) and reference them from the README with relative
paths (`docs/screenshots/home.png`).

## Specs (all shots)

| Setting | Value |
|---|---|
| Viewport | **1440×900** (viewport shot, not full-page, unless noted) |
| Theme | **dark** — the site default (`next-themes`, `defaultTheme="dark"`) |
| Locale | Use an explicit prefix: `/en/...` for the English README or `/pt-BR/...` — pick one and stay consistent (the middleware 307-redirects bare `/` to `/pt-BR`) |
| Format | PNG, kebab-case names (see table), ideally < 300 KB each |
| Browser | Chromium via Playwright (already a `frontend` devDependency) — clean profile, no extensions |

## Prerequisites

```bash
docker compose up --build        # frontend :3000, backend :8000, PG, Redis
cd frontend && pnpm install
npx playwright install chromium  # one-time browser download
```

The `/lab`, `/status` and contact-backed features need the backend; the static
pages render without it, but capture everything with the full stack up so the
shots match production behavior.

## Pages to capture

| File | URL | What must be visible in the shot |
|---|---|---|
| `home.png` | `http://localhost:3000/en` | First viewport: header, hero headline, badges and the 3D hero visual slot (right column) |
| `project-blue-sentinel.png` | `http://localhost:3000/en/projects/blue-sentinel` | Case-study page: title, tags, "Problema/Solução/Arquitetura" content above the fold |
| `lab-incident.png` | `http://localhost:3000/en/lab` | **Mid-incident**: scenario `brute-force` running, event queue streaming, alerts raised, and the **Incident timeline** card populated (it auto-opens at high/critical severity) |
| `security.png` | `http://localhost:3000/en/security` | Threat model + security measures cards with their status badges |
| `status.png` | `http://localhost:3000/en/status` | Live metrics dashboard: CPU/RAM/disk charts, DB/Redis latency, API health |

## Capture with the Playwright CLI

`npx playwright screenshot` handles the four static-ish pages:

```bash
cd frontend

npx playwright screenshot --viewport-size=1440,900 --color-scheme=dark \
  --wait-for-timeout=5000 \
  http://localhost:3000/en ../docs/screenshots/home.png

npx playwright screenshot --viewport-size=1440,900 --color-scheme=dark \
  --wait-for-timeout=5000 \
  http://localhost:3000/en/projects/blue-sentinel \
  ../docs/screenshots/project-blue-sentinel.png

npx playwright screenshot --viewport-size=1440,900 --color-scheme=dark \
  --wait-for-timeout=5000 \
  http://localhost:3000/en/security ../docs/screenshots/security.png

npx playwright screenshot --viewport-size=1440,900 --color-scheme=dark \
  --wait-for-timeout=8000 \
  http://localhost:3000/en/status ../docs/screenshots/status.png
```

Notes:

- `--color-scheme=dark` matters because the theme provider has
  `enableSystem` — the CLI defaults to a light preference.
- `/status` gets `8000 ms` so the charts have time to fetch metrics from the
  backend and render.
- Add `--full-page` only if you deliberately want a tall shot; the README
  tables above assume first-viewport crops.

## `lab-incident.png` needs interaction (CLI cannot click)

The incident timeline only appears once a scenario reaches high/critical
severity. Use a short script (run from `frontend/`, with the stack up):

```bash
node --input-type=module -e '
import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
await page.goto("http://localhost:3000/en/lab");
await page.getByRole("button", { name: /Credential brute force/i }).click();
await page.getByRole("button", { name: "Run scenario" }).click();
await page.getByRole("heading", { name: "Incident timeline" }).scrollIntoViewIfNeeded();
await page.getByText("Opened by").waitFor({ timeout: 60000 });
await page.waitForTimeout(2000);
await page.screenshot({ path: "../docs/screenshots/lab-incident.png" });
await browser.close();
'
```

Use `?scenario=brute-force` in the URL to preselect the scenario, and the
**Speed** control in the lab UI if you want the run to finish faster. Explore
selectors first with `npx playwright codegen http://localhost:3000/en/lab` if
the labels ever change.

## GIF recipe (lab detecting a scenario)

Target: a 10–20 s loop, ≤ ~8 MB, 1280 px wide, showing *Run scenario → events
streaming → alerts → incident timeline*. Options, best first:

1. **Playwright video → ffmpeg** (fully scripted, consistent framing):

   ```bash
   cd frontend
   node --input-type=module -e '
   import { chromium } from "playwright";
   const browser = await chromium.launch();
   const context = await browser.newContext({
     viewport: { width: 1440, height: 900 }, colorScheme: "dark",
     recordVideo: { dir: "tmp-video", size: { width: 1440, height: 900 } },
   });
   const page = await context.newPage();
   await page.goto("http://localhost:3000/en/lab");
   await page.getByRole("button", { name: /Credential brute force/i }).click();
   await page.getByRole("button", { name: "Run scenario" }).click();
   await page.getByText("Opened by").waitFor({ timeout: 60000 });
   await page.waitForTimeout(3000);
   await context.close();  // flushes the .webm
   await browser.close();
   '

   ffmpeg -i frontend/tmp-video/*.webm \
     -vf "fps=12,scale=1280:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" \
     docs/screenshots/lab-incident.gif
   ```

2. **ScreenToGif** (Windows, free) or **LICEcap** (macOS/Windows): start a
   recording of the lab viewport, click *Run scenario*, stop when the incident
   timeline closes the sequence, trim to the interesting part. Use
   `npx playwright codegen http://localhost:3000/en/lab` beforehand to rehearse
   the click path.

3. **Not suitable:** `npx playwright screenshot` cannot record video and
   cannot drive the UI — use it only for the static PNGs.

## Where each file is referenced in the README

The root `README.md` does not embed images yet; add them at these anchors:

| File | README.md anchor (proposed) |
|---|---|
| `home.png` | Top of the file, under the one-line description (banner), and/or the **Features → Frontend** bullet list |
| `project-blue-sentinel.png` | **Pages** table, row `/projects/[slug]` |
| `lab-incident.png` | **Detection Rules (Sigma / YARA)** section intro, and/or **Pages** row `/lab` |
| `security.png` | **Pages** row `/security` |
| `status.png` | **Pages** row `/status` |

Suggested markdown form (relative paths keep it working on GitHub and PyPI-like
mirrors):

```markdown
![Blue-Sentinel detection lab during a brute-force incident](docs/screenshots/lab-incident.png)
```

## Checklist (run before committing)

- [ ] All five PNGs captured at **1440×900**, viewport crop, **dark** theme
- [ ] One locale throughout (`/en/...` or `/pt-BR/...`, no mixed set)
- [ ] `lab-incident.png` shows a real incident (timeline populated, severity
      badge visible) — not an idle lab
- [ ] `status.png` charts are populated (took the shot after metrics loaded)
- [ ] **All visible data is synthetic/fictitious**: no real names, e-mails,
      tokens, internal hostnames, IPs or personal GitHub/avatar data. Lab
      events are synthetic by design (RFC 5737 documentation IPs); double-check
      the `/status` panel and any cached GitHub stats before publishing
- [ ] No browser chrome, tooltips, cursors, notification popups or dev-server
      error overlays in frame
- [ ] Each file < ~300 KB (PNG) / GIF < ~8 MB; re-export or downscale if not
- [ ] Files live in `docs/screenshots/` with the exact keystone names
- [ ] README references updated at the anchors in the table above
