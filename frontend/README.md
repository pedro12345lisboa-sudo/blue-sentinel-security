# Blue-Sentinel Frontend

Next.js 14 portfolio frontend with TypeScript, Tailwind CSS, MDX, and GSAP animations.

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS + CSS Variables |
| Content | MDX (`next-mdx-remote`) |
| Animation | GSAP + ScrollTrigger |
| Charts | Recharts |
| 3D | Three.js (slot in hero) |
| Icons | Lucide React |
| Forms | React Hook Form + Zod |
| Data Fetching | SWR |
| Real-time | Socket.io Client |
| UI Primitives | Radix UI (shadcn-style) |
| Testing | Vitest + Testing Library + Playwright |

## Project Structure

```
frontend/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── (site)/             # Route group for main site
│   │   │   ├── layout.tsx      # Site layout wrapper
│   │   │   ├── page.tsx        # Home page
│   │   │   ├── about/page.tsx
│   │   │   ├── projects/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [slug]/page.tsx
│   │   │   ├── writeups/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [slug]/page.tsx
│   │   │   ├── lab/page.tsx
│   │   │   ├── status/page.tsx
│   │   │   ├── security/page.tsx
│   │   │   ├── contact/page.tsx
│   │   │   └── resume/page.tsx
│   │   ├── layout.tsx          # Root layout (fonts, providers)
│   │   └── globals.css         # Global styles + tokens
│   ├── components/
│   │   ├── ui/                 # shadcn-style primitives (Button, Card, Input, etc.)
│   │   ├── sections/           # Home page sections (Hero, Skills, FeaturedProjects, etc.)
│   │   ├── cards/              # Reusable card components
│   │   ├── motion/             # GSAP animation wrappers
│   │   ├── three/              # Three.js components (hero slot)
│   │   ├── common/             # Shared components (Header, Footer, etc.)
│   │   └── mdx-components.tsx  # Custom MDX component mappings
│   ├── layouts/
│   │   └── site-layout.tsx     # Header + Footer wrapper
│   ├── hooks/
│   │   ├── use-reduced-motion.ts
│   │   ├── use-in-view.ts
│   │   ├── use-scroll-progress.ts
│   │   ├── use-counter.ts
│   │   └── use-gsap.ts
│   ├── services/
│   │   └── api.ts              # Typed API client (SWR + fetch)
│   ├── types/
│   │   └── index.ts            # Shared TypeScript types
│   ├── styles/
│   │   ├── tokens.css          # CSS custom properties (design tokens)
│   │   └── globals.css         # Tailwind imports + global styles
│   └── lib/
│       └── utils.ts            # Utility functions (cn, formatDate, etc.)
├── content/
│   ├── projects/               # Project MDX files
│   └── writeups/               # Writeup MDX files
├── public/                     # Static assets (images, icons, manifest)
├── e2e/                        # Playwright tests
├── vitest.config.ts            # Vitest configuration
├── vitest.setup.ts             # Vitest setup
├── playwright.config.ts        # Playwright configuration
├── next.config.js              # Next.js config
├── tailwind.config.js          # Tailwind config (custom theme)
├── postcss.config.js           # PostCSS config
├── tsconfig.json               # TypeScript config
├── .eslintrc.json              # ESLint config
├── .prettierrc                 # Prettier config
└── package.json
```

## Design System

### Colors (CSS Variables)

```css
/* Dark theme (default) */
--background: 222 47% 4%;
--foreground: 210 40% 98%;
--primary: 199 89% 48%;        /* Blue #3B82F6 */
--primary-glow: 199 89% 58%;
--accent: 199 89% 48%;
--success: 142 76% 36%;        /* Green #22D3EE */
--warning: 38 92% 50%;
--destructive: 0 63% 31%;
--cyan: 187 100% 42%;          /* #22D3EE */

/* Light theme */
--background: 0 0% 100%;
--foreground: 222 47% 4%;
--primary: 199 89% 42%;
```

### Typography

| Token | Size/Line Height | Usage |
|-------|------------------|-------|
| `display-xl` | clamp(3.5rem, 8vw, 6rem) / 1.1 | Hero titles |
| `display-lg` | clamp(2.5rem, 5vw, 4rem) / 1.15 | Section titles |
| `display-md` | clamp(2rem, 4vw, 3rem) / 1.2 | Card titles |
| `heading-xl` | 1.875rem / 1.3 | Subsection headers |
| `body-lg` | 1.125rem / 1.6 | Lead paragraphs |
| `body` | 1rem / 1.6 | Body text |
| `caption` | 0.75rem / 1.5 | Captions, meta |

### Fonts

| Font | Variable | Usage |
|------|----------|-------|
| Inter | `--font-inter` | UI, body text |
| JetBrains Mono | `--font-jetbrains-mono` | Code, technical data |
| Space Grotesk | `--font-space-grotesk` | Display headings |

### Spacing Scale

```css
/* Standard Tailwind + custom */
space-18: 4.5rem (72px)
space-22: 5.5rem (88px)
space-30: 7.5rem (120px)
```

## Animations

### CSS Animations (respects `prefers-reduced-motion`)

```css
@keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes pulseGlow { 0%,100% { box-shadow: 0 0 20px... } 50% { box-shadow: 0 0 30px... } }
@keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
```

### Utility Classes

```css
.animate-fade-in
.animate-fade-in-up
.animate-fade-in-down
.animate-slide-in-left
.animate-slide-in-right
.animate-scale-in
.animate-pulse-glow
.animate-float
.animate-spin-slow
.animate-shimmer
```

### GSAP Animations (Client Components Only)

```tsx
'use client';

import { useGSAP } from '@/hooks/use-gsap';

export function AnimatedSection() {
  const { gsap } = useGSAP();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!gsap) return;
    const ctx = gsap.context(() => {
      gsap.from('.child', { y: 30, opacity: 0, duration: 0.6, stagger: 0.1 });
    }, ref);
    return () => ctx.revert();
  }, [gsap]);

  return <div ref={ref}>...</div>;
}
```

### Reduced Motion

All animations automatically disabled when user prefers reduced motion:

```tsx
const reducedMotion = useReducedMotion();

useEffect(() => {
  if (reducedMotion) return;
  // GSAP animations here
}, [reducedMotion]);
```

## MDX Components

Custom components available in all MDX files:

```mdx
import { Callout, ProjectCard } from '@/components/mdx-components';

<Callout type="info" title="Note">
  This is an informational callout.
</Callout>

<Callout type="warning" title="Warning">
  This is a warning callout.
</Callout>

<Callout type="danger" title="Danger">
  This is a danger callout.
</Callout>

<Callout type="success" title="Success">
  This is a success callout.
</Callout>

<ProjectCard project={frontmatter} />
```

## API Client

```tsx
// services/api.ts
import useSWR from 'swr';

export function useProjects() {
  return useSWR<Project[]>('/api/backend/api/v1/projects', fetcher);
}

export function useProject(slug: string) {
  return useSWR<Project>(`/api/backend/api/v1/projects/${slug}`, fetcher);
}

export function useGitHubStats() {
  return useSWR<GitHubStats>('/api/backend/api/v1/github/stats', fetcher, {
    refreshInterval: 3600000, // 1 hour
  });
}
```

## Testing

### Unit Tests (Vitest)

```bash
pnpm test           # Run once
pnpm test:watch     # Watch mode
pnpm test:coverage  # Coverage report
pnpm test:ui        # Vitest UI
```

### E2E Tests (Playwright)

```bash
pnpm e2e            # Headless
pnpm e2e:headed     # Headed
pnpm e2e:ui         # Playwright UI
```

### Test Structure

```
src/
├── components/
│   └── ui/
│       ├── button.test.tsx
│       └── ...
├── app/
│   └── contact/
│       └── page.test.tsx
└── lib/
    └── utils.test.ts
```

## Performance

### Next.js Optimizations

- **Output**: `standalone` for minimal Docker image
- **Images**: `next/image` with AVIF/WebP, remote patterns configured
- **Fonts**: `next/font` with `display: swap`, self-hosted
- **Dynamic Imports**: GSAP, Three.js, Recharts loaded client-side only
- **Code Splitting**: Automatic per-route

### Lighthouse Targets

| Metric | Target |
|--------|--------|
| Performance | > 90 |
| Accessibility | > 95 |
| Best Practices | > 90 |
| SEO | > 90 |
| LCP | < 2.5s |
| CLS | < 0.1 |

### Bundle Analysis

```bash
ANALYZE=true pnpm build
```

## Accessibility

### Semantic HTML

- Proper heading hierarchy (h1 → h2 → h3)
- Landmarks: `<header>`, `<nav>`, `<main>`, `<aside>`, `<footer>`
- `<section>` with `aria-labelledby`
- `<article>` for standalone content

### Keyboard Navigation

- Visible focus styles (`focus-visible-ring`)
- Skip link (first tab stop)
- Logical tab order
- ARIA labels on icon-only buttons

### Screen Readers

- Alt text on all images
- ARIA live regions for dynamic content
- Proper form labels
- Status messages with `role="status"`

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Scripts

```bash
# Development
pnpm dev              # Start dev server
pnpm dev:https        # Dev with HTTPS (mkcert)

# Build
pnpm build            # Production build
pnpm build:analyze    # Bundle analysis

# Quality
pnpm lint             # ESLint
pnpm type-check       # TypeScript check
pnpm format           # Prettier

# Testing
pnpm test             # Vitest run
pnpm test:watch       # Vitest watch
pnpm test:coverage    # Coverage report
pnpm test:ui          # Vitest UI
pnpm e2e              # Playwright
pnpm e2e:ui           # Playwright UI

# Docker
docker build -t blue-sentinel-frontend .
docker run -p 3000:3000 blue-sentinel-frontend
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Backend API URL | `http://localhost:8000` |

## Deployment

### Docker (Production)

```dockerfile
# Multi-stage build included in Dockerfile
# Output: standalone Next.js app
docker build -t blue-sentinel-frontend .
docker run -p 3000:3000 -e NEXT_PUBLIC_API_URL=https://api.example.com blue-sentinel-frontend
```

### Vercel (Recommended)

1. Connect GitHub repo
2. Set `NEXT_PUBLIC_API_URL` env var
3. Deploy

### Static Export (Optional)

```js
// next.config.js
output: 'export',
images: { unoptimized: true },
```

## Contributing

1. Follow existing code style (ESLint + Prettier)
2. Write tests for new components
3. Update documentation for new features
4. Ensure accessibility compliance
5. Respect `prefers-reduced-motion`
6. Use semantic HTML

## License

MIT