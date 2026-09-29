# Blue-Sentinel — Design System

Source of truth, token pipeline, component states, responsive rules, accessibility
criteria and the handoff map (Figma variable → CSS variable → Tailwind class).

Companion documents:

- `docs/design/motion.md` — motion language, storyboards and reduced-motion rules.
- `assets-src/figma/README.md` — Figma file structure, naming conventions, export, checklist.
- `assets-src/figma/design-tokens.json` — machine-readable tokens (Tokens Studio format).

---

## 1. Source of truth & pipeline

Everything starts from **`assets-src/figma/design-tokens.json`** (223 tokens). Nothing is
authored directly in CSS or Tailwind — every change begins in the JSON, is validated, and
is then emitted to code:

```text
assets-src/figma/design-tokens.json
        │
        ▼  .venv/Scripts/python.exe scripts/build_design_tokens.py
        │
        ├── frontend/src/styles/tokens.css            (CSS variables, dark mode only)
        ├── assets-src/figma/tailwind.config.snippet.ts  (theme.extend snippet)
        └── stdout: WCAG contrast report (37 pairs)  + HSL roundtrip check
```

| File | Role | Edit? |
|---|---|---|
| `assets-src/figma/design-tokens.json` | Single source of truth | **Yes** (only place) |
| `scripts/build_design_tokens.py` | Generator + validator (`--check` for CI) | Yes |
| `frontend/src/styles/tokens.css` | Generated CSS variables | **No** (generated) |
| `frontend/tailwind.config.js` | Tailwind theme (mirror of the snippet) | Yes (mirror snippet) |
| `assets-src/figma/tailwind.config.snippet.ts` | Generated snippet for `tailwind.config.ts` | **No** (generated) |
| `frontend/src/styles/globals.css` | Runtime: base, components, utilities | Yes |
| `frontend/src/app/layout.tsx` | Imports `tokens.css` **before** `globals.css` | Order matters |

Validation built into the generator:

- reference resolution (`{group.token}`) must be acyclic and complete;
- HSL bridge roundtrip must return the original hex exactly (50 variables);
- contrast report prints `Pares avaliados | falhas` — currently **37 pairs, 1 fail**
  (decorative border `#22304D`, documented as exempt in §9).

```bash
.venv/Scripts/python.exe scripts/build_design_tokens.py           # regenerate
.venv/Scripts/python.exe scripts/build_design_tokens.py --check   # CI / pre-commit
```

---

## 2. Color

### 2.1 Primitives (raw ramps)

| Ramp | Used steps |
|---|---|
| `ink` (neutrals + navy) | `950 #0B1220`, `900 #111A2E`, `800 #17233D`, `750 #1C2A47`, `700 #22304D`, `600 #2E3F63`, `500 #5E6F96`, `400 #7E8EAA`, `300 #93A4C0`, `200 #B7C4DB`, `100 #E6EDF7`, `50 #F5F8FF` |
| `blue` (brand) | `300 #93C5FD`, `400 #60A5FA`, `500 #3B82F6`, `600 #2563EB` |
| `cyan` (accent) | `300 #67E8F9`, `400 #22D3EE`, `500 #06B6D4` |
| `red` (destructive/critical) | `400 #F87171`, `500 #EF4444`, `600 #DC2626` |
| `orange` (high severity) | `300 #FDBA74`, `500 #F97316` |
| `yellow` (medium/warning) | `400 #FACC15`, `500 #EAB308` |
| `emerald` (success) | `400 #34D399`, `500 #10B981` |

### 2.2 Semantic roles

| Role | Token | Value | Tailwind |
|---|---|---|---|
| Page background | `color.background.page` | `#0B1220` | `bg-background` |
| Card / surface | `color.background.surface` | `#111A2E` | `bg-card` |
| Elevated surface | `color.background.elevated` | `#17233D` | `bg-secondary`, `bg-popover` |
| Hover surface | `color.background.hover` | `#1C2A47` | `bg-secondary-hover` |
| Overlay | `color.background.overlay` | `#0B1220CC` | `bg-background/80` |
| Default border | `color.border.default` | `#22304D` | `border-border` |
| Interactive border | `color.border.interactive` | `#5E6F96` | `border-input` |
| Focus border | `color.border.focus` | `#22D3EE` | `ring-ring` |
| Primary text | `color.text.primary` | `#E6EDF7` | `text-foreground` |
| Secondary text | `color.text.secondary` | `#93A4C0` | `text-muted-foreground` |
| Tertiary text | `color.text.tertiary` | `#7E8EAA` | `text-foreground/70` / captions |
| Link | `color.text.link` / `linkHover` | `#60A5FA` / `#93C5FD` | `text-link`, `hover:text-link-hover` |
| Disabled text | `color.text.disabled` | `#5E6F96` | `disabled:text-muted-foreground` |
| Primary action | `color.primary.default/hover` | `#3B82F6` / `#60A5FA` | `bg-primary`, `bg-primary-hover` |
| Text on primary (solid) | `color.primary.foreground` | `#0B1220` | `text-primary-foreground` |
| Primary as text | `color.primary.text` | `#60A5FA` | `text-primary-text` |
| Accent | `color.accent.default/hover` | `#22D3EE` / `#67E8F9` | `bg-accent`, `bg-accent-hover` |
| Destructive | `color.destructive.default/hover` | `#EF4444` / `#F87171` | `bg-destructive`, `bg-destructive-hover` |
| Success | `color.success.default/hover` | `#10B981` / `#34D399` | `bg-success`, `bg-success-hover` |
| Warning | `color.warning.default/hover` | `#EAB308` / `#FACC15` | `bg-warning`, `bg-warning-hover` |
| Severity critical/high/medium/low | `color.severity.*` | `#EF4444` / `#F97316` / `#EAB308` / `#3B82F6` | `text-critical`, `text-high`, `text-medium`, `text-low` |
| Severity text (on tint) | `color.severity.*.text` | `#F87171` / `#FDBA74` / `#FACC15` / `#60A5FA` | `text-critical-text`, … |

`*-subtle` tokens are the brand color at 10% alpha (`#3B82F61A`), `*-border` at 25%
(`#3B82F640`), `*-glow` at 30% (`#3B82F64D`).

### 2.3 Binding color rules

1. **Text on a solid color is always `ink-950 #0B1220`** (never white): primary 5.09:1,
   accent 10.36:1, destructive 4.98:1, success 7.38:1, warning 9.76:1.
2. **Hover must not use alpha on the button color.** `bg-primary/90` pushes navy text to
   4.35:1 (fails). Use the dedicated hover token instead: `bg-primary-hover #60A5FA`
   (7.36:1), `bg-destructive-hover #F87171`, `bg-success-hover #34D399`.
3. **`blue.500 #3B82F6` is a fill, not small text.** On the elevated surface it is 4.25:1 —
   valid only ≥18.66px bold (large text) or as non-text UI. Small text uses
   `blue.400 #60A5FA` (6.14:1 on elevated).
4. **Badges / labels on a 10% tint use the `*-text` variant**, never the raw base color
   (e.g. critical badge text `#F87171`, not `#EF4444`).
5. **Focus ring = cyan `#22D3EE`, 2px, 2px offset.** On page background that is 10.36:1.
6. **`ink-500 #5E6F96` is the interactive border** (inputs, outline buttons): 3.46:1 on
   surface, 3.12:1 on elevated — meets the 3:1 non-text requirement.
7. **`ink-700 #22304D` is decorative only** (dividers, grid pattern): 1.42:1, documented
   exemption — never use it for information that must be perceivable.
8. Dark mode only. `color.background.overlay` is used for scrims and modals.

---

## 3. Typography

Families: **Inter** (sans + display) and **JetBrains Mono** (code, log output, terminal
labels). Space Grotesk is retired; `--font-space-grotesk` is aliased to Inter so legacy
class names keep working.

| Style | Size | Line height | Tracking | Use |
|---|---|---|---|---|
| `display-xl` | `clamp(3.5rem, 8vw, 6rem)` | 1.1 | -0.03em | Home hero title only |
| `display-lg` | `clamp(2.75rem, 6vw, 4.5rem)` | 1.1 | -0.02em | Page heroes (About, Projects, Writeups, Contact, Security) |
| `display-md` | `clamp(2rem, 4vw, 3rem)` | 1.25 | -0.02em | Section titles, Resume hero |
| `display-sm` | `clamp(1.5rem, 3vw, 2.25rem)` | 1.25 | -0.02em | Compact page headers (Lab, Status) |
| `heading-xl` | 1.75rem | 1.25 | -0.02em | Card group title |
| `heading-lg` | 1.5rem | 1.25 | -0.02em | Section heading |
| `heading-md` | 1.25rem | 1.25 | 0 | Subsection / card title |
| `heading-sm` | 1.125rem | 1.25 | 0 | Small card title |
| `body-lg` | 1.125rem | 1.6 | 0 | Lead paragraph under h1 |
| `body` | 1rem | 1.6 | 0 | Default copy |
| `body-sm` | 0.875rem | 1.6 | 0 | Secondary copy, form help |
| `caption` | 0.75rem | 1.6 | 0 | Metadata, timestamps |
| `overline` | 0.6875rem | 1.25 | 0.08em | Eyebrow labels (uppercase) |
| code | `body-sm` in JetBrains Mono | 1.6 | 0 | Inline code, log lines |

Measures: `prose 68ch` for long-form, `narrow 48ch` for columns/asides.

Classes: `.heading-display` (display + bold + tight), `.heading-section` (section
pattern), `.text-gradient` (primary → accent → success, decorative titles only — the
gradient must never be the sole carrier of meaning).

Weights available: 400 / 500 / 600 / 700. Do not fake bold with `font-semibold` +
`text-shadow`.

---

## 4. Spacing, layout & breakpoints

### 4.1 Spacing scale (base unit 8px)

| Token | px | Alias | Typical use |
|---|---|---|---|
| `scale-1` | 4 | `--space-1` | icon↔label micro gap |
| `scale-2` | 8 | `--space-2` | inline gap, badge padding |
| `scale-3` | 12 | `--space-3` | stacked label/input |
| `scale-4` | 16 | `--space-4` | card padding (sm), list rhythm |
| `scale-5` | 20 | `--space-5` | input vertical padding |
| `scale-6` | 24 | `--space-6` | card padding, component gap |
| `scale-8` | 32 | `--space-8` | block separation |
| `scale-10` | 40 | `--space-10` | sub-section separation |
| `scale-12` | 48 | `--space-12` | section padding (mobile) |
| `scale-16` | 64 | `--space-16` | section padding (tablet) |
| `scale-20` | 80 | `--space-20` | hero padding |
| `scale-24` | 96 | `--space-24` | section padding (desktop) |

Section gap: `48px` mobile / `64px` tablet / `96px` desktop → `.section` uses
`py-12 md:py-16 lg:py-24`; `.section-sm` uses `py-8 md:py-12 lg:py-16`.

### 4.2 Layout

| Token | Value | Class / usage |
|---|---|---|
| `layout.container.max` | 1200px | `.container-site` |
| `layout.containerPadding` | 16 / 24 / 32 px | `px-4 sm:px-6 lg:px-8` (mobile/tablet/desktop) |
| `layout.columns` | 12 | grid layouts |
| `layout.gutter` | 24px | `gap-6` |
| `layout.headerHeight` | 64px | `h-16` sticky header, `scroll-mt-16` anchors |
| `layout.readingWidth` | 720px | article prose column |
| `grid.backgroundSize` | 48px | `.grid-pattern` (opacity 0.35) |

Secondary containers: `.container-narrow` (`max-w-4xl`, prose) and `.container-wide`
(`max-w-7xl`, card grids).

### 4.3 Breakpoints (must match Figma frames)

| Name | min-width | Tailwind | Frame |
|---|---|---|---|
| mobile | 360px | `xs:` | 360 × 640 |
| sm | 640px | `sm:` | — |
| tablet | 768px | `md:` | 768 × 1024 |
| desktop | 1024px | `lg:` | 1024 × 768 |
| xl | 1280px | `xl:` | — |
| wide | 1440px | `wide:` | 1440 × 900 |
| 2xl | 1536px | `2xl:` | — |

Design handoff target: **1440px desktop** and **375/360px mobile**; tablet and wide are
noted only where the layout changes structurally.

---

## 5. Radius, borders, elevation

| Radius token | px | Tailwind | Use |
|---|---|---|---|
| `none` | 0 | `rounded-none` | table cells, dividers |
| `sm` | 4 | `rounded-sm` | tags, code chips |
| `md` | 8 | `rounded-md` | small buttons, dropdowns, badges |
| `lg` | 12 | `rounded-lg` | **default**: buttons, inputs, cards |
| `xl` | 16 | `rounded-xl` | feature cards, panels |
| `2xl` | 24 | `rounded-2xl` | hero visual slot, modals (mobile) |
| `full` | 9999 | `rounded-full` | pills, avatars, dots |

Borders: thin `1px` everywhere; focus `2px` ring with `2px` offset. Never `2px` for
decorative dividers.

| Shadow token | Value | Use |
|---|---|---|
| `shadow-sm` | `0 1px 2px 0 rgb(3 7 18 / .5)` | resting cards |
| `shadow-md` | `0 4px 12px -2px rgb(3 7 18 / .55)` | dropdowns, popovers |
| `shadow-lg` | `0 12px 32px -8px rgb(3 7 18 / .6)` | dialogs, toasts |
| `shadow-glow-primary` | `0 0 20px rgb(59 130 246 / .3), 0 0 40px … / .1` | primary CTA hover |
| `shadow-glow-accent` | same shape, cyan | accent CTA hover |
| `shadow-glow-success` | emerald | success CTA |
| `shadow-glow-warning` | yellow | warning CTA |
| `shadow-glow-destructive` | red | destructive CTA |
| `shadow-glow` (alias) | primary glow | `.card-hover`, `.btn-primary` |

Glass surfaces: `.glass` (`bg-card/80 + blur-md + border/50`) and `.glass-strong`
(`bg-card/90 + blur-lg`) for sticky header and floating toolbars only.

## 6. Z-index scale

| Token | Value | Tailwind | Use |
|---|---|---|---|
| `base` | 0 | `z-base` | page content |
| `raised` | 10 | `z-raised` | raised cards |
| `sticky` | 20 | `z-sticky` | sticky header, scroll progress |
| `dropdown` | 30 | `z-dropdown` | dropdown lists |
| `overlay` | 40 | `z-overlay` | modal scrim |
| `modal` | 50 | `z-modal` | dialog |
| `popover` | 60 | `z-popover` | popover |
| `tooltip` | 70 | `z-tooltip` | tooltip |
| `toast` | 80 | `z-toast` | toast viewport, skip-link |

Rule: never hardcode `z-[9999]` — extend the scale in the JSON instead.

---

## 7. Components & states

All interactive components share the same state contract:

| State | Rule |
|---|---|
| default | token set for the variant |
| hover | surface/brand **hover token** (no alpha), 200ms `ease-out` |
| focus-visible | `ring-2 ring-ring ring-offset-2 ring-offset-background` (cyan, 2px/2px) |
| active | `scale-[0.98]`, 150ms |
| disabled | `opacity-50 pointer-events-none` (never rely on color alone) |
| loading | `aria-busy`, spinner, `disabled` |

### 7.1 Button (`frontend/src/components/ui/button.tsx`)

Variants: `default` (primary), `destructive`, `outline`, `secondary`, `ghost`, `link`,
`success`. Sizes: `sm h-9`, `default h-10`, `lg h-11`, `xl h-12`, `icon 40×40`.

| Variant | Rest | Hover | Text | Extra |
|---|---|---|---|---|
| default | `bg-primary` | `bg-primary-hover` | `text-primary-foreground` | `shadow-glow` |
| destructive | `bg-destructive` | `bg-destructive-hover` | `text-destructive-foreground` | `shadow-glow-destructive` |
| success | `bg-success` | `bg-success-hover` | `text-success-foreground` | `shadow-glow-success` |
| outline | transparent + `border-input` | `hover:bg-accent hover:text-accent-foreground` | `text-primary-text` | — |
| secondary | `bg-secondary` | `bg-secondary-hover` | `text-secondary-foreground` | — |
| ghost | transparent | `hover:bg-accent/10 hover:text-accent` | `text-muted-foreground` | — |
| link | `text-primary` underline on hover | `hover:underline` | `text-primary` | offset 4px |

Utility classes mirror the same look for non-`Button` markup:
`.btn-primary`, `.btn-secondary`, `.btn-outline`, `.btn-ghost`.

### 7.2 Form controls

| Component | Rest | Focus | Error | Disabled |
|---|---|---|---|---|
| Input / Textarea | `bg-card`, `border-input`, `rounded-lg`, `px-4 py-3` | cyan ring | `border-destructive` + `text-destructive` message below, `aria-invalid` | `opacity-50 pointer-events-none` |
| Select | same as input | cyan ring | as input | as input |
| Label | `.label-base` (`text-sm font-medium text-foreground`, `mb-2`) | — | error text `text-destructive text-body-sm` | — |

Min height 44px (`touch-minimum`) for every control; helper/error text is `body-sm`.

### 7.3 Data display

| Component | Construction | States |
|---|---|---|
| Badge (`.badge-*`) | `rounded-full px-2.5 py-0.5 text-xs` + 10% tint + 30% border | `primary`, `accent`, `success`, `warning`, `destructive` |
| Severity badge | tint background + `color.severity.*.text` | `critical`, `high`, `medium`, `low` |
| Tag (`.tag`) | `bg-secondary`, mono `text-xs` | default / hover (link variant) |
| Card | `bg-card border rounded-xl`, `.card-hover` on hover | default / hover (`border-primary/30` + `shadow-glow`) / featured (border-primary) |
| Code block | `bg-card`, mono, `rounded-lg`, scroll-x | copy button hover/focus |
| Table | header `text-muted-foreground text-overline`, row `border-border`, hover `bg-card/60` | resting/hover |
| Stat counter | `text-display-md font-bold tabular-nums`, animated on view | static when reduced motion |

### 7.4 Feedback

| Component | Behavior | Tokens |
|---|---|---|
| Toast | enters from top (mobile bottom), 300ms | `bg-card border shadow-lg rounded-lg`, icon per status |
| Dialog | scrim `bg-black/80 blur-sm`, panel `rounded-lg p-6 shadow-lg`, 200ms zoom | z `modal` |
| Tooltip | `bg-popover border rounded-lg px-3 py-1.5 text-sm`, 150ms | z `tooltip` |
| Skeleton | `animate-pulse bg-secondary rounded-md` | never under text that must be read |
| Spinner | `animate-spin`, `currentColor` | always paired with `aria-busy` |

### 7.5 Chrome

- **Header**: `h-16 sticky top-0 z-sticky glass-strong`; active nav item marked by a
  `h-1.5 bg-primary` indicator that slides; mobile uses a drawer (≥44px hit area).
- **Footer**: `bg-card border-t border-border`, link grid, `text-muted-foreground`,
  hover `text-foreground`.
- **Skip link**: `.skip-link` (visually hidden, `z-toast`, revealed on focus).

### 7.6 Accessibility notes per component

- Button: real `<button>`, `aria-busy` while loading, no `div` handlers.
- Dialog/Select/Tooltip/Popover: Radix primitives — focus trap, `Escape`, correct roles.
- Badge/severity: color is never the only signal — always paired with a text label.
- Nav: `aria-current="page"` for the active route.

---

## 8. Responsive rules

| Aspect | 360 (mobile) | 768 (tablet) | 1024 (desktop) | 1440 (wide) |
|---|---|---|---|---|
| Container | full width − 16px padding | − 24px | − 32px, max 1200px | centered 1200px, side gutters |
| Header | logo + hamburger (drawer) | logo + condensed nav | full nav + CTA | full nav + CTA |
| Hero | stacked, title `display-sm`, min-height auto | stacked, `display-md` | 2-column (copy / visual) | 2-column, `display-xl` |
| Card grid | 1 column | 2 columns | 3 columns (`lg:grid-cols-3`) | 3–4 columns |
| Section padding | `py-12` | `py-16` | `py-24` | `py-24` |
| Typography | body 16px, no clamp below 360 | clamp mid | clamp max | clamp max |
| Tables / code | horizontal scroll, `scrollbar-hide` | horizontal scroll | fit | fit |
| Touch targets | ≥44px (`touch-minimum`) | ≥44px | ≥44px (mouse) | ≥44px |

Rules:

1. Mobile-first: base styles are 360px; `sm/md/lg/wide` only add structure.
2. Never hide content to "fit" — reorder with `flex`/`grid` order and priority.
3. Below 640px all multi-column grids become single column; CTAs become full width.
4. Breakpoints are shared with Figma frames (§4.3) — never invent a new one in code.

---

## 9. Accessibility

### 9.1 Contrast table (generated)

Produced by `scripts/build_design_tokens.py` — regenerate after any color change.

| Foreground | Background | Ratio | WCAG |
|---|---|---|---|
| text primary `#E6EDF7` | page `#0B1220` | **15.89:1** | AAA |
| text primary `#E6EDF7` | surface `#111A2E` | **14.72:1** | AAA |
| text primary `#E6EDF7` | elevated `#17233D` | **13.26:1** | AAA |
| text secondary `#93A4C0` | page `#0B1220` | **7.41:1** | AAA |
| text secondary `#93A4C0` | surface `#111A2E` | **6.86:1** | AA |
| text secondary `#93A4C0` | elevated `#17233D` | **6.18:1** | AA |
| text tertiary `#7E8EAA` | page `#0B1220` | **5.65:1** | AA |
| text tertiary `#7E8EAA` | surface `#111A2E` | **5.23:1** | AA |
| text tertiary `#7E8EAA` | elevated `#17233D` | **4.71:1** | AA |
| link (blue.400) `#60A5FA` | page `#0B1220` | **7.36:1** | AAA |
| link (blue.400) `#60A5FA` | elevated `#17233D` | **6.14:1** | AA |
| link hover (blue.300) `#93C5FD` | elevated `#17233D` | **8.66:1** | AAA |
| brand blue (blue.500) `#3B82F6` | page `#0B1220` | **5.09:1** | AA |
| brand blue (blue.500) `#3B82F6` | elevated `#17233D` | **4.25:1** | AA large/UI only |
| navy `#0B1220` on primary button `#3B82F6` | — | **5.09:1** | AA |
| navy on primary hover `#60A5FA` | — | **7.36:1** | AAA |
| navy on accent `#22D3EE` | — | **10.36:1** | AAA |
| navy on accent hover `#67E8F9` | — | **12.92:1** | AAA |
| navy on destructive `#EF4444` | — | **4.98:1** | AA |
| navy on destructive hover `#F87171` | — | **6.77:1** | AA |
| navy on success `#10B981` | — | **7.38:1** | AAA |
| navy on warning `#EAB308` | — | **9.76:1** | AAA |
| severity critical `#EF4444` | page `#0B1220` | **4.98:1** | AA |
| severity high `#F97316` | page `#0B1220` | **6.68:1** | AA |
| severity medium `#EAB308` | page `#0B1220` | **9.76:1** | AAA |
| severity low `#3B82F6` | page `#0B1220` | **5.09:1** | AA |
| badge critical (text) `#F87171` | tint 10% over `#111A2E` `#271E30` | **5.77:1** | AA |
| badge high (text) `#FDBA74` | tint 10% over `#111A2E` `#28232C` | **9.11:1** | AAA |
| badge medium (text) `#FACC15` | tint 10% over `#111A2E` `#27292A` | **9.54:1** | AAA |
| badge low (text) `#60A5FA` | tint 10% over `#111A2E` `#152442` | **6.06:1** | AA |
| badge primary (text) `#60A5FA` | tint 10% over `#111A2E` `#152442` | **6.06:1** | AA |
| focus ring (cyan) `#22D3EE` | page `#0B1220` | **10.36:1** | AAA |
| control border `#5E6F96` | surface `#111A2E` | **3.46:1** | AA large/UI |
| control border `#5E6F96` | elevated `#17233D` | **3.12:1** | AA large/UI |
| disabled text `#5E6F96` (exempt) | page `#0B1220` | **3.74:1** | AA large/UI |
| **decorative border `#22304D`** | page `#0B1220` | **1.42:1** | **FAIL (exempt — decorative)** |

Evaluated: 37 pairs · Failures: 1 (decorative, documented exemption).

### 9.2 Non-contrast requirements

- **Keyboard**: every action reachable in logical DOM order; visible `:focus-visible` ring
  on all interactive elements; skip link as first tab stop.
- **Touch**: ≥44×44px targets (`--touch-minimum`), 48px recommended.
- **Motion**: `prefers-reduced-motion` honored at three layers (see `motion.md` §5).
- **Semantics**: one `h1` per page, landmarks (`header`/`main`/`footer`), `aria-label` on
  icon-only controls, decorative layers marked `aria-hidden="true"`.
- **Content**: text contrast ≥4.5:1 (AA) for all body text; no information conveyed by
  color alone (severity always has a label).

---

## 10. Token map: Figma variable → CSS variable → Tailwind class

| Figma variable | CSS variable (`tokens.css`) | Tailwind class |
|---|---|---|
| `color/background/page` | `--background` (bridge) · `--bs-color-background-page` | `bg-background` |
| `color/background/surface` | `--card` · `--bs-color-background-surface` | `bg-card` |
| `color/background/elevated` | `--secondary` / `--popover` | `bg-secondary`, `bg-popover` |
| `color/background/hover` | `--secondary-hover` | `bg-secondary-hover` |
| `color/border/default` | `--border` | `border-border` |
| `color/border/interactive` | `--input` / `--border-interactive` | `border-input` |
| `color/border/focus` | `--ring` | `ring-ring` |
| `color/text/primary` | `--foreground` | `text-foreground` |
| `color/text/secondary` | `--muted-foreground` | `text-muted-foreground` |
| `color/text/tertiary` | `--bs-color-text-tertiary` | `text-foreground/70` |
| `color/text/link` | `--link` | `text-link` |
| `color/text/inverse` | `--bs-color-text-inverse` | `text-background` |
| `color/primary/default` | `--primary` | `bg-primary` |
| `color/primary/hover` | `--primary-hover` | `bg-primary-hover` |
| `color/primary/foreground` | `--primary-foreground` | `text-primary-foreground` |
| `color/primary/text` | `--primary-text` | `text-primary-text` |
| `color/accent/default` | `--accent` | `bg-accent` |
| `color/accent/hover` | `--accent-hover` | `bg-accent-hover` |
| `color/destructive/default` | `--destructive` | `bg-destructive` |
| `color/success/default` | `--success` | `bg-success` |
| `color/warning/default` | `--warning` | `bg-warning` |
| `color/severity/critical/text` | `--critical-text` | `text-critical-text` |
| `color/severity/high/base` | `--high` | `text-high` |
| `typography/fontFamily/sans` | `--font-sans` · `--font-inter` | `font-sans` |
| `typography/fontFamily/mono` | `--font-mono` · `--font-jetbrains-mono` | `font-mono` |
| `typography/fontSize/displayLg` | `--text-display-lg` | `text-display-lg` |
| `typography/fontSize/body` | `--text-body` | `text-body` |
| `spacing/scale/6` | `--space-6` | `p-6` / `gap-6` |
| `spacing/sectionGap/desktop` | `--bs-spacing-section-gap-desktop` | `.section` `lg:py-24` |
| `layout/container/max` | `--bs-layout-container-max` | `.container-site` |
| `borderRadius/lg` | `--radius-lg` | `rounded-lg` |
| `borderWidth/thin` | `--border-w-thin` | `border` |
| `shadow/glowPrimary` | `--bs-shadow-glow-primary` | `shadow-glow` |
| `zIndex/modal` | `--z-modal` | `z-modal` |
| `breakpoint/desktop` | `--bp-desktop` | `lg:` (1024px) |
| `duration/fast` | `--duration-fast` | `duration-fast` |
| `easing/expoOut` | `--ease-expo-out` | `ease-[cubic-bezier(0.19,1,0.22,1)]` |
| `stagger/default` | `--stagger-default` | used by GSAP `stagger` |
| `focus/ringColor` | `--focus-ring-color` / `--ring` | `focus-visible-ring` |
| `touch/minimum` | `--bs-touch-minimum` | min-h/h-11 |
| `motion/reduced/duration` | `--motion-reduced-duration` | used in `@media (prefers-reduced-motion)` |

Naming mapping for Figma: JSON path `color.background.page` → Figma variable group
`color/background` + name `page` → CSS `--bs-color-background-page` (generated) →
bridge `--background` → Tailwind `bg-background`.

---

## 11. Wireframes (11 screens, above the fold)

Every frame starts below a **64px sticky header**. "Above the fold" = the first
**836px** of a 1440×900 desktop viewport (or 576px of a 360×640 mobile viewport) — all
listed content must be visible without scrolling.

| # | Screen | Route | Above the fold (desktop 1440) | Above the fold (mobile 360) |
|---|---|---|---|---|
| 1 | Home | `/` | Header · hero: overline `blue-sentinel`, `display-xl` title, lead paragraph, 2 CTAs (primary + outline), trust row (Defensive Only / Open Source / Real-time Lab), 3D visual slot right | Header · stacked hero, `display-sm`, lead, stacked CTAs full width, top of visual slot |
| 2 | About | `/about` | Header · hero with mono `blue-sentinel - About` h1 (`display-lg`), lead paragraph, scroll cue | Header · h1 `display-lg` clamped, lead |
| 3 | Projects | `/projects` | Header · h1 `blue-sentinel Projects` + lead + filter/sort row, first project card row (2–3 cards) | Header · h1 + lead + first card |
| 4 | Project detail | `/projects/[slug]` | Header · title (`display-lg`), meta badges (year, stack tags), 2 CTAs (Live / Source), first paragraph of summary | Header · title, badges, CTAs |
| 5 | Writeups | `/writeups` | Header · h1 `Technical Writeups` + lead, first 3 writeup rows (date · title · tags) | Header · h1 + lead + first row |
| 6 | Writeup detail | `/writeups/[slug]` | Header · title, meta line (date, read time, tags), TOC start, first content block | Header · title + meta + first block |
| 7 | Lab | `/lab` | Header · compact h1 `blue-sentinel Lab` (`display-sm`) + subtitle, toolbar (scenario select, run button), terminal/code panel top edge | Header · h1 + subtitle + toolbar |
| 8 | Security | `/security` | Header · h1 `Security Architecture` + lead, first principle card row | Header · h1 + lead + first card |
| 9 | Status | `/status` | Header · h1 `System Status` + subtitle, 4 stat tiles (uptime, latency, TX/RX, alerts), first service row | Header · h1 + first 2 stat tiles |
| 10 | Contact | `/contact` | Header · h1 `Get In Touch` + lead, first 2 form fields (name, email) + submit | Header · h1 + lead + first field |
| 11 | Resume | `/resume` | Header · h1 `Resume / CV` (`display-md`) + subtitle, download CTA, first experience entry | Header · h1 + CTA + first entry |

Wireframe fidelity: gray boxes for images, real text for headings/labels, spacing from
§4, no color. Each frame gets annotations for: which component instance is used, spacing
tokens, and the breakpoint at which the layout changes.

Not in scope of the 11: `/404` (system error state — design it as an extension of the
Status page pattern).

---

## 12. Exporting tokens to Figma

1. Create the file with the 9 pages listed in `assets-src/figma/README.md`.
2. In **Foundations**, create Figma Variables collection `Design Tokens`:
   - group `color/primitive/*` (raw hex), group `color/*` (semantic, points at primitives);
   - mode: `dark` (single mode — dark-only product).
3. Import `design-tokens.json` with **Tokens Studio for Figma** (or paste the JSON into a
   plugin that reads Tokens Studio format): every key is already
   `group.token` with a `type` (`color`, `typography`, `spacing`, `borderRadius`, `boxShadow`,
   `duration`, `other`).
4. After any token edit in Figma → export back to JSON → run the generator → commit both
   JSON and generated files together.
5. Never hand-edit `tokens.css` or `tailwind.config.snippet.ts`; regenerate.

---

## 13. Handoff checklist

### Design system
- [ ] Color variables defined (primitives + semantics) with a single `dark` mode
- [ ] Typography scale complete, display sizes use fluid `clamp`
- [ ] Spacing scale (4–96) and section gaps documented
- [ ] Radius, border, shadow/glow, z-index scales defined
- [ ] Breakpoints match code (360 / 768 / 1024 / 1440)
- [ ] Focus ring spec (2px cyan + 2px offset) applied to every interactive element

### Components
- [ ] All variants × sizes × states exist (rest, hover, focus, active, disabled, loading)
- [ ] Component properties documented in the description panel
- [ ] Keyboard behavior and ARIA roles annotated
- [ ] Auto Layout on, 8px base unit, padding horizontal ≥ vertical
- [ ] Touch targets ≥44px on mobile variants

### Screens
- [ ] 11 screens at 1440 and 375/360, content real (no lorem ipsum)
- [ ] Above-the-fold content verified per §11
- [ ] Tablet (768) and wide (1440) annotated where layout changes
- [ ] Instance names + spacing annotations on each frame

### Motion
- [ ] Storyboards for each animated section (see `motion.md`)
- [ ] Duration/easing/stagger/delay annotated per keyframe
- [ ] Reduced-motion variant drawn next to the default
- [ ] Scroll trigger positions noted

### Assets
- [ ] Icons exported as SVG 24×24, `icon-[name]`
- [ ] Images exported as WebP 1x/2x, `img-[description]-[width]w`
- [ ] Favicon set (16/32/48/192/512)

### Documentation & code
- [ ] `design-tokens.json` round-trips from Figma Variables
- [ ] `scripts/build_design_tokens.py` runs clean (`--check`, 0 unexpected contrast fails)
- [ ] `tokens.css` + `tailwind.config.snippet.ts` regenerated and committed
- [ ] `design-system.md`, `motion.md`, `assets-src/figma/README.md` updated
- [ ] Figma link placeholder replaced with the real file ID

---

## Appendix A — Known pendências (design-relevant)

Environment / repo state observed while validating this spec:

| Item | Status |
|---|---|
| `node_modules` is only partially installed (top level has 28 links; `.pnpm` store has 813). Missing: `@radix-ui/*`, `class-variance-authority`, `next-themes`, `vitest`, `@playwright`, `eslint-plugin-tailwindcss` | Run `pnpm install` in `frontend/` before `type-check` / `lint` / `build` |
| `@/hooks` has no barrel (`src/hooks/index.ts`) | `next build` fails with "Module not found"; add `index.ts` re-exporting the 5 hooks |
| `contact/page.tsx` exports `metadata` from a `"use client"` component | Move `metadata` to a server wrapper or delete it |
| Fonts (Inter, JetBrains Mono) are not loaded — no `next/font` | Add `next/font/google` and map to `--font-inter` / `--font-jetbrains-mono` |
| `text-primary` on elevated surfaces | Use `text-primary-text` (blue.400) — 4.25:1 fails for small text |
| Hover alpha (`bg-primary/90`) | Forbidden — use `*-hover` tokens (§2.3) |
| Severity colors in the Lab page | Mapped from `color.severity.*`; confirm labels with the Security page |

Already verified in this change set:

- `scripts/build_design_tokens.py --check` → 223 tokens, 50 HSL bridge vars, roundtrip exact, 37 contrast pairs / 1 documented fail.
- `tailwindcss -i src/styles/globals.css` compiles from `frontend/` (56KB) and every documented class (§10) is generated when used in markup.
- `tailwind.config.snippet.ts` type-checks standalone (`tsc --strict`, `Config` annotation).
