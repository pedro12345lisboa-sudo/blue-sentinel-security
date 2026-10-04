import { Metadata } from 'next';
import { Search, Filter, Tag, Github, ExternalLink, ArrowRight, Code, Shield, Zap, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAllProjects, ProjectFrontmatter } from '@/lib/projects';
import { getSite, pageMetadata, LocalizedLink, type Locale } from '@/i18n';

interface ProjectsProps {
  params: { locale: Locale };
}

export function generateMetadata({ params }: ProjectsProps): Metadata {
  const site = getSite(params.locale);
  return pageMetadata(params.locale, {
    title: site.seo.projects.title,
    description: site.seo.projects.description,
    path: '/projects',
  });
}

export default function ProjectsPage({ params }: ProjectsProps) {
  const site = getSite(params.locale);
  const projects = getAllProjects(params.locale);
  const allTags = Array.from(new Set(projects.flatMap((project) => project.tags))).sort();
  const highlightedProjects = projects.filter((p) => p.highlight);
  const regularProjects = projects.filter((p) => !p.highlight);

  const getIcon = (iconName?: string) => {
    switch (iconName) {
      case 'Shield': return <Shield className="h-6 w-6" />;
      case 'Code': return <Code className="h-6 w-6" />;
      case 'Zap': return <Zap className="h-6 w-6" />;
      case 'Terminal': return <Terminal className="h-6 w-6" />;
      default: return <Shield className="h-6 w-6" />;
    }
  };

  return (
    <div className="min-h-screen">
      <section className="section relative overflow-hidden">
        <div className="absolute inset-0 gradient-mesh" aria-hidden="true" />
        <div className="absolute inset-0 noise-overlay" aria-hidden="true" />
        <div className="container-wide relative">
          <div className="max-w-3xl">
            <h1 className="mb-4 text-display-lg font-display font-bold tracking-tight">
              <span className="font-mono text-primary">{site.pages.projects.titleAccent}</span>{' '}
              {site.pages.projects.title}
            </h1>
            <p className="text-lg text-muted-foreground text-balance">
              {site.pages.projects.description}
            </p>
          </div>
        </div>
      </section>

      <section className="section-sm bg-gradient-to-b from-background to-card/50" aria-labelledby="filters-title">
        <div className="container-wide">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <label htmlFor="tag-filter" className="sr-only">{site.pages.projects.filters.label}</label>
              <select
                id="tag-filter"
                className="input-base w-auto min-w-[200px] bg-background"
                aria-label={site.pages.projects.filters.label}
              >
                <option value="">{site.pages.projects.filters.all}</option>
                {allTags.map((tag) => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Tag className="h-4 w-4" aria-hidden="true" />
              <span>
                {projects.length}{' '}
                {projects.length === 1
                  ? site.pages.projects.filters.countOne
                  : site.pages.projects.filters.count}
              </span>
            </div>
          </div>
        </div>
      </section>

      {highlightedProjects.length > 0 && (
        <section className="section-sm" aria-labelledby="highlighted-title">
          <div className="container-wide">
            <h2 id="highlighted-title" className="mb-8 text-center heading-section text-display-md">
              {site.pages.projects.highlightedTitle}
            </h2>
            <div className="grid gap-6 lg:grid-cols-2">
              {highlightedProjects.map((project) => (
                <article
                  key={project.slug}
                  className="group relative rounded-2xl border border-border/50 bg-card/50 p-6 transition-all duration-300 hover:border-primary/30 hover:shadow-glow hover:bg-card"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      {getIcon(project.icon)}
                    </div>
                    {project.highlight && (
                      <Badge variant="success">{site.pages.projects.labels.highlight}</Badge>
                    )}
                  </div>
                  <CardTitle className="mb-2 text-xl group-hover:text-primary transition-colors">
                    <LocalizedLink
                      href={`/projects/${project.slug}`}
                      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring after:absolute after:inset-0 after:content-['']"
                    >
                      {project.title}
                    </LocalizedLink>
                  </CardTitle>
                  <p className="mb-4 text-muted-foreground">{project.description}</p>
                  <div className="mb-4 flex flex-wrap gap-2">
                    {project.tags.slice(0, 5).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                    ))}
                    {project.tags.length > 5 && (
                      <Badge variant="ghost" className="text-xs">
                        +{project.tags.length - 5} {site.pages.projects.labels.moreTags}
                      </Badge>
                    )}
                  </div>
                  <div className="relative z-10 flex items-center gap-3 pt-4 border-t border-border/50">
                    {project.links?.github && (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={project.links.github} target="_blank" rel="noopener noreferrer">
                          <Github className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                          {site.pages.projects.labels.code}
                        </a>
                      </Button>
                    )}
                    {project.links?.demo && (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={project.links.demo}>
                          <ArrowRight className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                          {site.pages.projects.labels.demo}
                        </a>
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="section" aria-labelledby="all-projects-title">
        <div className="container-wide">
          <h2 id="all-projects-title" className="mb-8 text-center heading-section text-display-md">
            {site.pages.projects.allTitle}
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {regularProjects.map((project) => (
              <article
                key={project.slug}
                className="group relative h-full rounded-2xl border border-border/50 bg-card/50 p-6 transition-all duration-300 hover:border-primary/30 hover:shadow-glow hover:bg-card"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    {getIcon(project.icon)}
                  </div>
                  <span className="text-xs font-mono text-muted-foreground">{project.date.split('-')[0]}</span>
                </div>
                <CardTitle className="mb-2 group-hover:text-primary transition-colors">
                  <LocalizedLink
                    href={`/projects/${project.slug}`}
                    className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring after:absolute after:inset-0 after:content-['']"
                  >
                    {project.title}
                  </LocalizedLink>
                </CardTitle>
                <p className="mb-4 text-sm text-muted-foreground line-clamp-2">{project.description}</p>
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {project.tags.slice(0, 4).map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                  ))}
                  {project.tags.length > 4 && (
                    <Badge variant="ghost" className="text-xs">
                      +{project.tags.length - 4} {site.pages.projects.labels.moreTags}
                    </Badge>
                  )}
                </div>
                <div className="relative z-10 flex items-center gap-2 pt-4 border-t border-border/50">
                  {project.links?.github && (
                    <Button variant="ghost" size="sm" asChild>
                      <a href={project.links.github} target="_blank" rel="noopener noreferrer" className="text-xs gap-1.5">
                        <Github className="h-3 w-3" aria-hidden="true" />
                        {site.pages.projects.labels.code}
                      </a>
                    </Button>
                  )}
                  {project.links?.demo && (
                    <Button variant="ghost" size="sm" asChild>
                      <a href={project.links.demo} className="text-xs gap-1.5">
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        {site.pages.projects.labels.demo}
                      </a>
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>

          {regularProjects.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                {projects.length === 0
                  ? site.pages.projects.emptyAll
                  : site.pages.projects.empty}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}