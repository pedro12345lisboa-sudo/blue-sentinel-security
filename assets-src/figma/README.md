# Blue-Sentinel — Figma File Specification

## File Link
**Figma File:** [Blue-Sentinel Portfolio — Design System & Screens](https://www.figma.com/file/PLACEHOLDER/Blue-Sentinel-Portfolio)

> **Note:** Replace `PLACEHOLDER` with actual file ID after creating the file.

## Related documents

- `docs/design/design-system.md` — foundations, component states, contrast table,
  token map (Figma variable → CSS variable → Tailwind class), wireframes, handoff.
- `docs/design/motion.md` — storyboard strips, timing/easing/stagger tokens,
  reduced-motion variants.
- `assets-src/figma/design-tokens.json` — Tokens Studio JSON of every token in this spec.

## Files in this folder

| File | Purpose | Edit? |
|---|---|---|
| `design-tokens.json` | Single source of truth (223 tokens, Tokens Studio format) | **Yes** |
| `tailwind.config.snippet.ts` | Generated `theme.extend` snippet | No (generated) |
| `README.md` | This file — Figma structure, conventions, handoff | Yes |

---

## Page Organization

### 1. Cover
- Project name, version, last updated, author
- Thumbnail preview of hero section
- Links to: Design System, Wireframes, Desktop, Mobile, Prototype

### 2. Foundations
- **Color Primitives** — Raw HEX values (no semantic names)
- **Color Semantic** — Variables mapped to purpose (background, surface, primary, etc.)
- **Typography** — Font families, scale, line heights, letter spacing
- **Spacing** — Base unit (8px), scale, layout containers
- **Grid & Layout** — 12-column grid, container max-width, breakpoints
- **Shadows & Effects** — Elevation levels, glow effects, border styles
- **Border Radius** — Scale from none to full
- **Z-Index** — Layering scale
- **Breakpoints** — Mobile, tablet, desktop, wide
- **Accessibility** — Contrast verification table (see below), focus ring spec
  (cyan `#22D3EE`, 2px + 2px offset), touch target 44px, single `dark` mode

### 3. Components
Organized by category with Variants and Auto Layout:

| Category | Components |
|----------|------------|
| **Buttons** | Primary, Secondary, Ghost — sizes (sm, md, lg, xl) — states (default, hover, focus, active, disabled, loading) |
| **Header** | Desktop nav, mobile drawer, logo, CTA button, active section indicator |
| **Footer** | Links grid, social icons, copyright |
| **Cards** | Project card (featured, default), Skill card, Stat counter card |
| **Navigation** | Breadcrumbs, pagination, tabs |
| **Form** | Input, Textarea, Select, Label, Checkbox, Radio — states |
| **Data Display** | Badge/Tag, Table, Code block, Timeline item, Alert (lab) |
| **Feedback** | Toast, Skeleton, Spinner, Tooltip, Dialog/Modal |
| **Layout** | Container, Section, Grid, Stack, Divider |

### 4. Wireframes
Low-fidelity structure for all screens:
- Home, About, Projects list, Project detail, Writeups list, Writeup detail
- Lab, Security, Status, Contact, Resume, 404
- Focus: content hierarchy, spacing, responsive behavior
- **Above the fold:** every frame must show its required content in the first
  836px of a 1440×900 viewport (576px at 360×640) — the per-screen list lives in
  `docs/design/design-system.md` §11. Draw a dashed "fold" line on every frame.

### 5. Desktop (≥1024px)
High-fidelity screens at 1440px width:
- All 11 pages with real content
- Component instances from Components page
- Annotated with spacing, alignment, component names

### 6. Mobile (360–768px)
High-fidelity screens at 375px width:
- All 11 pages adapted
- Mobile-specific: drawer menu, stacked layouts, touch targets ≥44px
- Touch gestures noted (swipe, pull-to-refresh)

### 7. Motion
Storyboard frames for each animated section (full spec in `docs/design/motion.md`):
- Entry animations (fade, slide, scale)
- Scroll-triggered animations (GSAP ScrollTrigger)
- Micro-interactions (hover, focus, tap)
- Reduced motion variants (always drawn next to the default)
- Timing specs: duration, easing, delay, stagger — from the token scale
  (150–700ms; durations `duration/*`, easing `easing/*`, stagger 40/60/80ms)

### 8. Prototype
Interactive flows:
- Home → Project detail → Contact
- Mobile menu open/close
- Lab WebSocket simulation
- Form validation states
- Theme toggle (if implemented)

### 9. Handoff
Developer-focused annotations:
- **Token Mapping Table** — Figma Variable → CSS Variable → Tailwind Class
- **Component Specs** — Props, variants, states, accessibility notes
- **Screen Specs** — Responsive behavior, breakpoint changes
- **Asset Export** — SVG/PNG/WebP specs, naming convention
- **Checklist** — See Handoff Checklist below

---

## Token Pipeline (JSON → CSS → Tailwind)

```text
assets-src/figma/design-tokens.json        ← edited by hand / exported from Figma
        │
        ▼  .venv/Scripts/python.exe scripts/build_design_tokens.py
        │
        ├── frontend/src/styles/tokens.css               (generated — do not edit)
        ├── assets-src/figma/tailwind.config.snippet.ts  (generated — do not edit)
        └── stdout: WCAG contrast report + HSL roundtrip validation
```

- Import the JSON into Figma with **Tokens Studio** (groups = `group`, keys = `token`,
  every entry carries a `type`). Export back to JSON after token edits, then regenerate.
- CI / pre-commit check: `.venv/Scripts/python.exe scripts/build_design_tokens.py --check`
  (fails on broken references, HSL roundtrip mismatch, or unexpected contrast failures).
- Contrast baseline (generated): **37 pairs evaluated, 1 documented failure** — the
  decorative border `#22304D` (1.42:1), exempt because it never carries meaning.
  The full table lives in `docs/design/design-system.md` §9.1.
- Colors reach Tailwind as `hsl(var(--x))` (HSL bridge in `tokens.css`), so opacity
  modifiers such as `bg-primary/10` work without breaking contrast rules.

---

## Conventions

### Naming
- **Frames:** `Screen / Page Name / Variant` (e.g., `Screen / Home / Desktop`)
- **Components:** `Component / Name / Variant / State` (e.g., `Button / Primary / Large / Hover`)
- **Variables:** `category/semantic-name` (e.g., `color/background-primary`, `spacing/4`)
- **Layers:** Descriptive, no `Rectangle 42`, no `Group 1`

### Auto Layout
- All components use Auto Layout
- Spacing uses 8px base unit
- Padding: horizontal ≥ vertical
- Alignment: center for buttons, start for content

### Variants
- Boolean properties for: `isLoading`, `isDisabled`, `hasIcon`
- Single-select for: `size` (sm, md, lg, xl), `variant` (primary, secondary, ghost)
- Component properties documented in description

### Text Styles
- Named by semantic role: `Display XL`, `Display LG`, `Heading XL`, `Body LG`, `Caption`
- Not by size: avoid `Text 32px`

### Color Styles
- **Primitives:** `Primitive / Blue / 500` = `#3B82F6`
- **Semantics:** `Semantic / Primary / Default` = `Primitive / Blue / 500`
- Use Variables, not Styles, for colors

### Export
- Icons: SVG, 24×24, named `icon-[name]`
- Illustrations: SVG or WebP, named `illustration-[name]`
- Images: WebP (quality 80), named `img-[description]-[width]w`

---

## Handoff Checklist

### Design System
- [ ] All color variables defined and mapped to semantic names
- [ ] Typography scale complete with fluid clamping for display sizes
- [ ] Spacing scale documented (4–96)
- [ ] Shadow/elevation scale defined
- [ ] Border radius scale defined
- [ ] Z-index scale defined
- [ ] Breakpoints match code (360, 768, 1024, 1440)

### Components
- [ ] Every component has all variants and states
- [ ] Component properties documented (description panel)
- [ ] Accessibility annotations: focus order, ARIA labels, keyboard behavior
- [ ] Responsive behavior noted per breakpoint
- [ ] Auto Layout settings visible

### Screens
- [ ] All 11 pages designed for Desktop (1440px) and Mobile (375px)
- [ ] Tablet (768px) and Wide (1920px) noted where different
- [ ] Content real (not lorem ipsum) for key pages
- [ ] Annotations: spacing values, component instances, responsive changes

### Motion
- [ ] Storyboard frames for each animated section
- [ ] Timing specs: duration, easing, delay, stagger
- [ ] Reduced motion variants defined
- [ ] Scroll trigger positions noted

### Assets
- [ ] All icons exported as SVG
- [ ] Images exported as WebP at 1x, 2x
- [ ] Naming convention followed
- [ ] Favicon set (16, 32, 48, 192, 512)

### Documentation
- [ ] `design-tokens.json` re-exported from Figma Variables (round trip)
- [ ] `tokens.css` and `tailwind.config.snippet.ts` regenerated
      (`.venv/Scripts/python.exe scripts/build_design_tokens.py --check`)
- [ ] `design-system.md` and `motion.md` in `docs/design/` updated
- [ ] Contrast report re-run; new pairs pass AA (or are documented as exempt)
- [ ] This README updated with actual Figma link

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.2.0 | 2026-09-28 | Designer | Token pipeline, contrast baseline, wireframe fold rule, motion reference |
| 0.1.0 | 2026-09-28 | Designer | Initial specification |

---

## Questions for Design Review

1. **Theme:** Dark-only or light mode support? (Current: dark-only per spec)
2. **3D Hero:** Three.js slot — static placeholder or animated?
3. **Lab Visualization:** Real-time charts — Recharts only or custom canvas?
4. **Icons:** Lucide React (current) or custom icon set?
5. **Illustrations:** Custom SOC-themed illustrations or abstract geometric?