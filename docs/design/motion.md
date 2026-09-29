# Blue-Sentinel — Motion Language

Storyboard specification for Figma (`Motion` page) and the implementation rules that
back it up. Tokens come from `assets-src/figma/design-tokens.json` →
`frontend/src/styles/tokens.css`.

Companion: `docs/design/design-system.md`.

---

## 1. Principles

1. **Purpose before decoration.** Motion explains state change (enter, exit, focus,
   feedback) — it never delays content.
2. **Speed budget.** Micro-feedback ≤300ms, entrances 400–700ms, nothing exceeds 700ms
   except the hero visual (1s, one-shot).
3. **Distance budget.** Entrances travel 8–24px. Anything larger reads as "flying in".
4. **Easing carries personality.** Exponential ease-out for entrances (`expo.out`),
   standard curve for state changes, spring only for playful accents.
5. **Reduced motion is a first-class variant**, designed and annotated next to the
   default, not stripped later.

---

## 2. Motion tokens

### 2.1 Durations

| Token | Value | Use |
|---|---|---|
| `duration/instant` | 0ms | programmatic state swap (no transition) |
| `duration/micro` | 150ms | active/pressed, icon swap, nav indicator |
| `duration/fast` | 200ms | hover states, buttons, links, borders |
| `duration/normal` | 300ms | toasts, dropdowns, expand/collapse |
| `duration/slow` | 400ms | `.animate-in` generic entrance, dialogs |
| `duration/deliberate` | 500ms | section entrances (scroll-triggered) |
| `duration/entrance` | 600ms | card groups, form field groups |
| `duration/hero` | 700ms | hero-level entrances (spec ceiling) |
| *(code exception)* | 800ms–1s | hero timeline only (`.hero` one-shot) |

Tailwind: `duration-micro … duration-hero`; CSS: `--duration-fast` etc.

### 2.2 Easing

| Token | Curve | Use |
|---|---|---|
| `easing/standard` | `cubic-bezier(0.4, 0, 0.2, 1)` | default transitions |
| `easing/out` | `cubic-bezier(0, 0, 0.2, 1)` | hovers, `ease-out` |
| `easing/in` | `cubic-bezier(0.4, 0, 1, 1)` | exits |
| `easing/expoOut` | `cubic-bezier(0.19, 1, 0.22, 1)` | all entrance timelines (`ease: 'expo.out'`) |
| `easing/spring` | `cubic-bezier(0.175, 0.885, 0.32, 1.275)` | playful accents (badge pop, success pulse) |

### 2.3 Stagger & distance

| Token | Value |
|---|---|
| `stagger/tight` | 40ms (dense lists, table rows) |
| `stagger/default` | 60ms (typical UI groups) |
| `stagger/loose` | 80ms (feature cards) |
| `motion/distance/small` | 8px (in-place fade-ups) |
| `motion/distance/medium` | 16px (cards, panels) |
| `motion/distance/large` | 24px (hero blocks) |

Code uses seconds (`stagger: 0.1` = 100ms) — annotated below with both.

---

## 3. Storyboards

Notation: **Frame A** = rest, **Frame B** = mid, **Frame C** = end. In Figma, each
storyboard is a 3-frame strip with timing annotations on the connecting arrows.

### 3.1 Home — Hero (on load)

| # | Element | From → To | Duration | Easing | Delay / stagger |
|---|---|---|---|---|---|
| H1 | Eyebrow + title + lead (text group children) | `y: +40px, opacity 0` → rest | 800ms | `expo.out` | 0ms, stagger 150ms |
| H2 | CTA row (2 buttons + trust row) | `y: +30px, opacity 0` → rest | 600ms | `expo.out` | delay 400ms, stagger 100ms |
| H3 | 3D visual slot | `scale 0.95, opacity 0` → rest | 1000ms | `expo.out` | delay 200ms |
| H4 | Background layers (`gradient-mesh`, `noise-overlay`, `grid-pattern`) | static | — | — | parallax ≤8px on scroll (disabled under reduced motion) |

Frames: A = all hidden · B = title at 60%, CTAs entering, visual at 70% · C = rest.
Scroll cue: `animate-bounce` (loop, 1s) — decorative, removed under reduced motion.

### 3.2 Home — Featured Projects (scroll trigger)

Trigger: `useInView` with `rootMargin: 0px 0px -100px 0px`, `threshold 0.1`,
`triggerOnce: true`.

| Element | From → To | Duration | Easing | Stagger |
|---|---|---|---|---|
| `.project-card` × N | `y: +30px, opacity 0` → rest | 600ms | `expo.out` | 100ms |

Frames: A = section header visible, cards hidden · B = first 2 cards at 50% · C = grid rest.

### 3.3 Home — other sections

| Section | Trigger | Element | Duration | Stagger |
|---|---|---|---|---|
| Skills | in view (`-100px`) | skill items | 500ms | 80ms |
| Counters | in view (`-50px`) | stat value + label | 500ms + count-up | 80ms |
| Lab teaser | in view (`-100px`) | terminal preview rows | 600ms | 100ms |
| CTA | in view (`-50px`) | heading + buttons | 500ms | 80ms |

Count-up: numeric value animates 0 → target over ~1s with `ease-out`; under reduced
motion the final value is rendered immediately (no count-up).

### 3.4 Page heroes (About, Projects, Writeups, Contact, Security)

Same pattern as §3.1 but one tier lighter: title + lead + meta enter with
`y: +24px, opacity 0`, 600ms `expo.out`, stagger 80ms, no visual slot. Below the hero,
the first content block uses the section pattern (§3.2).

About page specifics (existing timeline): title group 600ms/stagger 100ms, stat row
500ms/stagger 50ms, timeline entries 600ms/stagger 100ms.

### 3.5 Status page

| Element | Duration | Stagger | Notes |
|---|---|---|---|
| Stat tiles (4) | 500ms | 80ms | values fade in, no count-up |
| Service rows | 500ms | 80ms | severity dot pulses once (spring) |
| Live refresh | instant value swap | — | underline flash 150ms `ease-out` |

### 3.6 Lab page

| Element | Duration | Stagger |
|---|---|---|
| Toolbar + panel | 500ms | 80ms |
| Log lines appended | 200ms fade-in each | 40ms |
| Run button → loading | spinner (infinite linear) | — |
| Result badge | 300ms pop (`easing/spring`) | — |

### 3.7 Micro-interactions (all screens)

| Interaction | From → To | Duration | Easing |
|---|---|---|---|
| Button hover | bg → `*-hover` token, `shadow-glow` | 200ms | `ease-out` |
| Button press | `scale 0.98` | 150ms | `ease-out` |
| Button release | back to `scale 1` | 200ms | `standard` |
| Link underline | `scaleX 0 → 1` origin bottom-left | 200ms | `ease-out` |
| Card hover | border → `primary/30`, glow | 200ms | `ease-out` |
| Input focus | border → cyan ring 2px/2px | 150ms | `standard` |
| Nav active indicator | slide to item | 300ms | `standard` |
| Header glass | blur 0 → 12px on scroll | 200ms | `ease-out` |
| Toast enter | from top (mobile: bottom) | 300ms | `expo.out` |
| Toast exit | slide + fade | 200ms | `ease-in` |
| Dialog enter | scrim fade + panel `zoom 0.95 → 1` | 200ms | `standard` |
| Dialog exit | reverse | 150ms | `ease-in` |
| Tooltip | fade + `zoom 0.95 → 1` + 4px slide | 150ms | `standard` |
| Dropdown/Select | fade + `zoom 0.95 → 1` | 200ms | `standard` |
| Drawer (mobile menu) | slide from right | 300ms | `expo.out` |
| Skeleton | opacity pulse loop | 1500ms | `ease-in-out` |
| Spinner | 360° linear loop | 800ms/turn | linear |

Radix-driven components use the `animate-in`/`animate-out` utilities
(`data-[state=open]:animate-in`, `fade-in-0`, `zoom-in-95`, `slide-in-from-*`); the
generic `.animate-in` utility is `400ms cubic-bezier(0, 0, 0.2, 1)`.

---

## 4. Figma storyboard conventions

1. One frame strip per animated element group: **Rest / Mid / End**, each frame is the
   component instance at that instant (never redrawn).
2. Annotation on every arrow: `duration · easing · delay · stagger`.
3. Layer naming: `motion/[section]/[element]/[state]` (e.g. `motion/hero/title/mid`).
4. Scroll-triggered strips include a **trigger frame**: a viewport frame with the scroll
   position and `rootMargin` noted (`-50px` / `-100px`).
5. Interactive states (hover/focus/pressed) live on the `Components` page as variants;
   `Motion` page only shows transitions between them.
6. Prototype: connect strips with *Smart Animate*, `ease out`, matching durations — used
   to review timing before implementation.

---

## 5. Reduced motion (3 enforcement layers)

| Layer | Where | Behavior |
|---|---|---|
| CSS | `globals.css` `@media (prefers-reduced-motion: reduce)` | `animation-duration: 0.01ms !important`, `transition-duration: 0.01ms !important`, `scroll-behavior: auto` |
| React | `useReducedMotion()` hook (`frontend/src/hooks/use-reduced-motion.ts`) | boolean + live `change` listener |
| GSAP | `useGSAP()` refuses to load/apply timelines; section effects early-return | no scroll-triggered entrances, no count-up, no parallax |

Rules for the reduced-motion variant:

- Entrances become **opacity-only** (no translate, no scale) at 0 duration — content
  appears immediately.
- Loops stop: bounce cue, skeleton pulse, spinner keeps rotating only if it communicates
  loading (otherwise static "Loading…" text).
- Parallax, scroll-linked transforms and the grid/noise drift are disabled
  (`motion.reduced.disableParallax = true`).
- Counters render final values.
- Figma: draw the reduced variant as a 2-frame strip (Rest → End, `0ms, opacity only`)
  and annotate `prefers-reduced-motion: reduce`.

Tokens: `motion/reduced/*` → `--motion-reduced-duration`, `--motion-reduced-disable-parallax`,
`--motion-reduced-disable-scroll-triggered`, `--motion-reduced-keep-opacity-only`.

---

## 6. Motion checklist (handoff)

- [ ] Every storyboard strip has Rest/Mid/End frames
- [ ] Every arrow annotated with duration, easing, delay, stagger
- [ ] All durations within 150–700ms (hero exception documented)
- [ ] Stagger values from the token scale (40/60/80ms, code may use 100–150ms for hero)
- [ ] Scroll triggers annotated with `rootMargin` and `triggerOnce`
- [ ] Reduced-motion variant drawn and annotated for each animated group
- [ ] Micro-interactions defined on component variants (hover/focus/pressed)
- [ ] No motion depends on color alone for meaning
- [ ] Timing matches `docs/design/design-system.md` tokens (`duration/*`, `easing/*`)
- [ ] Prototype review passed before implementation
