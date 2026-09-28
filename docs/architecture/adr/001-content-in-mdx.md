# ADR 001: Content Authoring in MDX vs Headless CMS

## Status
Accepted

## Context
The portfolio site needs to render rich content: project case studies, technical writing, about page, and detection lab documentation. Options considered:
- **MDX in repository** (co-located with code)
- **Headless CMS** (Contentful, Sanity, Strapi, Ghost)
- **Static Markdown + frontmatter only**

## Decision
Use **MDX files in the repository** (`frontend/content/**/*.mdx`) for all authored content.

## Rationale
| Factor | MDX in Repo | Headless CMS |
|--------|-------------|--------------|
| **Version control** | Native git history, PR reviews | Separate system, webhook sync |
| **Authoring workflow** | Edit in IDE, preview locally | Web UI, separate preview deploy |
| **Cost** | Free (GitHub) | $0–$500+/mo depending on scale |
| **Latency** | Build-time → static assets | Runtime API call (or ISR revalidate) |
| **Portability** | Plain files, easy migration | Vendor lock-in, export complexity |
| **Collaboration** | GitHub PRs, code review | CMS roles, editorial workflow |
| **Dynamic components** | Embed React components in MDX | Limited to CMS field types |

For a personal portfolio:
- Content changes are infrequent (weeks/months)
- Single author (or few collaborators)
- Zero budget preference
- Want full git history of content evolution
- Need to embed interactive React demos (e.g., detection lab visualization)

## Consequences
### Positive
- Content changes trigger deploy via git push
- No external dependency at runtime (fully static)
- Components like `<AlertCard />`, `<CodeBlock />` embeddable in MDX
- Simple backup: `git clone` gets everything

### Negative
- Non-technical contributors need git/Markdown skills
- No WYSIWYG editor (mitigated: local preview with `next dev`)
- Large media files bloat repo (mitigated: store in `public/` or external CDN)

## Implementation
```
frontend/
  content/
    projects/
      sentinel-agent.mdx
      network-tap.mdx
    writing/
      sigma-rules-101.mdx
      blue-team-career.mdx
    pages/
      about.mdx
      lab-docs.mdx
```
Each MDX file exports frontmatter (title, date, tags, summary) and body. Build-time script (`scripts/build-content.ts`) generates JSON index for navigation/search.

## Related
- ADR 002: Redis for Cache/Queue
- ADR 003: FastAPI for Backend