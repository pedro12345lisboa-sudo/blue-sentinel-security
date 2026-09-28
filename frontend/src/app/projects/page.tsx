import { Metadata } from 'next';
import Link from 'next/link';
import { Search, Filter, Tag, Github, ExternalLink, ArrowRight, Code, Shield, Zap, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAllProjects, ProjectFrontmatter } from '@/lib/projects';

export const metadata: Metadata = {
  title: 'Projects',
  description: 'Security projects: detection engineering, threat hunting frameworks, automation pipelines, and systems programming.',
};

const allTags = ['Detection', 'Automation', 'C++', 'Python', 'Go', 'Sigma', 'eBPF', 'MITRE ATT&CK', 'SIEM', 'SOAR'];

export default function ProjectsPage() {
  const projects = getAllProjects();
  const highlightedProjects = projects.filter((p) => p.frontmatter.highlight);
  const regularProjects = projects.filter((p) => !p.frontmatter.highlight);

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
              <span className="font-mono text-primary">blue-sentinel</span> Projects
            </h1>
            <p className="text-lg text-muted-foreground text-balance">
              Selected security projects spanning detection engineering, automation, threat hunting, and systems programming.
              Each project includes source code, documentation, and live demos where applicable.
            </p>
          </div>
        </div>
      </section>

      <section className="section-sm bg-gradient-to-b from-background to-card/50" aria-labelledby="filters-title">
        <div className="container-wide">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <label htmlFor="tag-filter" className="sr-only">Filter by tag</label>
              <select
                id="tag-filter"
                className="input-base w-auto min-w-[200px] bg-background"
                aria-label="Filter projects by technology"
              >
                <option value="">All Technologies</option>
                {allTags.map((tag) => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Tag className="h-4 w-4" aria-hidden="true" />
              <span>{projects.length} projects</span>
            </div>
          </div>
        </div>
      </section>

      {highlightedProjects.length > 0 && (
        <section className="section-sm" aria-labelledby="highlighted-title">
          <div className="container-wide">
            <h2 id="highlighted-title" className="mb-8 text-center heading-section text-display-md">
              Featured Projects
            </h2>
            <div className="grid gap-6 lg:grid-cols-2">
              {highlightedProjects.map((project) => (
                <article key={project.slug} className="group">
                  <Link
                    href={`/projects/${project.slug}`}
                    className="block rounded-2xl border border-border/50 bg-card/50 p-6 transition-all duration-300 hover:border-primary/30 hover:shadow-glow hover:bg-card"
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        {getIcon(project.frontmatter.icon)}
                      </div>
                      {project.frontmatter.highlight && (
                        <Badge variant="success">Destaque</Badge>
                      )}
                    </div>
                    <CardTitle className="mb-2 text-xl group-hover:text-primary transition-colors">
                      {project.frontmatter.title}
                    </CardTitle>
                    <p className="mb-4 text-muted-foreground">{project.frontmatter.description}</p>
                    <div className="mb-4 flex flex-wrap gap-2">
                      {project.frontmatter.tags.slice(0, 5).map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                      ))}
                      {project.frontmatter.tags.length > 5 && (
                        <Badge variant="ghost" className="text-xs">+{project.frontmatter.tags.length - 5}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 pt-4 border-t border-border/50">
                      {project.frontmatter.links?.github && (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={project.frontmatter.links.github} target="_blank" rel="noopener noreferrer">
                            <Github className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                            Code
                          </a>
                        </Button>
                      )}
                      {project.frontmatter.links?.demo && (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={project.frontmatter.links.demo}>
                            <ArrowRight className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                            Demo
                          </a>
                        </Button>
                      )}
                    </div>
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="section" aria-labelledby="all-projects-title">
        <div className="container-wide">
          <h2 id="all-projects-title" className="mb-8 text-center heading-section text-display-md">
            All Projects
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {regularProjects.map((project) => (
              <article key={project.slug}>
                <Link
                  href={`/projects/${project.slug}`}
                  className="block h-full rounded-2xl border border-border/50 bg-card/50 p-6 transition-all duration-300 hover:border-primary/30 hover:shadow-glow hover:bg-card"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      {getIcon(project.frontmatter.icon)}
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">{project.frontmatter.date.split('-')[0]}</span>
                  </div>
                  <CardTitle className="mb-2 group-hover:text-primary transition-colors">
                    {project.frontmatter.title}
                  </CardTitle>
                  <p className="mb-4 text-sm text-muted-foreground line-clamp-2">{project.frontmatter.description}</p>
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {project.frontmatter.tags.slice(0, 4).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                    ))}
                    {project.frontmatter.tags.length > 4 && (
                      <Badge variant="ghost" className="text-xs">+{project.frontmatter.tags.length - 4}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 pt-4 border-t border-border/50">
                    {project.frontmatter.links?.github && (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={project.frontmatter.links.github} target="_blank" rel="noopener noreferrer" className="text-xs gap-1.5">
                          <Github className="h-3 w-3" aria-hidden="true" />
                          Code
                        </a>
                      </Button>
                    )}
                    {project.frontmatter.links?.demo && (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={project.frontmatter.links.demo} className="text-xs gap-1.5">
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          Demo
                        </a>
                      </Button>
                    )}
                  </div>
                </Link>
              </article>
            ))}
          </div>

          {regularProjects.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No additional projects yet. Check back soon!</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}