import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';
import {
  Github,
  ExternalLink,
  ArrowLeft,
  Calendar,
  Tag,
  Clock,
  Shield,
  Code,
  Zap,
  Terminal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { MDXComponents } from '@/components/mdx-components';
import { UntranslatedNotice } from '@/components/common/untranslated-notice';
import { getProjectBySlug } from '@/lib/projects';
import {
  LocalizedLink,
  formatDate,
  formatNumber,
  getSite,
  pageMetadata,
  type Locale,
} from '@/i18n';

interface ProjectPageProps {
  params: { slug: string; locale: Locale };
}

const getIcon = (iconName?: string) => {
  switch (iconName) {
    case 'Shield':
      return <Shield className="h-6 w-6" />;
    case 'Code':
      return <Code className="h-6 w-6" />;
    case 'Zap':
      return <Zap className="h-6 w-6" />;
    case 'Terminal':
      return <Terminal className="h-6 w-6" />;
    default:
      return <Shield className="h-6 w-6" />;
  }
};

export function generateMetadata({ params }: ProjectPageProps): Metadata {
  const site = getSite(params.locale);
  const project = getProjectBySlug(params.locale, params.slug);
  if (!project) {
    return pageMetadata(params.locale, {
      title: site.seo.notFound.title,
      description: site.pages.projects.detail.notFound,
      path: `/projects/${params.slug}`,
      type: 'article',
    });
  }
  const base = pageMetadata(params.locale, {
    title: project.frontmatter.title,
    description: project.frontmatter.description,
    path: `/projects/${params.slug}`,
    type: 'article',
    image: project.frontmatter.thumbnail,
  });
  return {
    ...base,
    openGraph: {
      ...base.openGraph,
      type: 'article' as const,
      publishedTime: project.frontmatter.date,
      tags: project.frontmatter.tags,
    },
  };
}

export default function ProjectPage({ params }: ProjectPageProps) {
  const site = getSite(params.locale);
  const project = getProjectBySlug(params.locale, params.slug);

  if (!project) {
    notFound();
  }

  const { frontmatter, content, untranslated } = project;
  const readingMinutes = Math.max(1, Math.ceil(content.split(/\s+/).length / 200));

  return (
    <article className="min-h-screen">
      <header className="section relative overflow-hidden">
        <div className="gradient-mesh absolute inset-0" aria-hidden="true" />
        <div className="noise-overlay absolute inset-0" aria-hidden="true" />
        <div className="container-wide relative">
          <LocalizedLink
            href="/projects"
            className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {site.pages.projects.detail.back}
          </LocalizedLink>

          {frontmatter.highlight && (
            <Badge variant="success" className="mb-4 w-fit">
              {site.pages.projects.detail.highlight}
            </Badge>
          )}

          <div className="mb-6 flex flex-wrap items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
              {getIcon(frontmatter.icon)}
            </div>
            <div>
              <h1 className="font-display text-display-md font-bold tracking-tight">
                {frontmatter.title}
              </h1>
              <p className="mt-2 text-lg text-muted-foreground">
                {frontmatter.description}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" aria-hidden="true" />
              <time dateTime={frontmatter.date}>
                {formatDate(frontmatter.date, params.locale)}
              </time>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" aria-hidden="true" />
              <span>{formatNumber(readingMinutes, params.locale)} {site.pages.projects.detail.minRead}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Tag className="h-4 w-4" aria-hidden="true" />
              <span>{frontmatter.tags.length} {site.microcopy.misc.tags}</span>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {frontmatter.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="gap-1.5">
                <Tag className="h-3 w-3" aria-hidden="true" />
                {tag}
              </Badge>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {frontmatter.links?.github && (
              <Button variant="outline" asChild>
                <a
                  href={frontmatter.links.github}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Github className="mr-2 h-4 w-4" aria-hidden="true" />
                  {site.pages.projects.detail.viewSource}
                </a>
              </Button>
            )}
            {frontmatter.links?.demo && (
              <Button asChild>
                <a href={frontmatter.links.demo}>
                  <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                  {site.pages.projects.detail.liveDemo}
                </a>
              </Button>
            )}
            {frontmatter.links?.docs && (
              <Button variant="ghost" asChild>
                <a
                  href={frontmatter.links.docs}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                  {site.pages.projects.detail.docs}
                </a>
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="container-wide px-6 py-16">
        <div className="grid gap-12 lg:grid-cols-4">
          <aside className="space-y-8 lg:col-span-1">
            <Card>
              <CardContent className="pt-6">
                <h3 className="mb-4 text-lg font-semibold">{site.pages.projects.detail.title}</h3>
                <dl className="space-y-4 text-sm">
                  <div>
                    <dt className="text-muted-foreground">{site.pages.projects.detail.type}</dt>
                    <dd className="font-medium text-foreground">{site.pages.projects.detail.typeValue}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{site.pages.projects.detail.status}</dt>
                    <dd className="flex items-center gap-1.5 font-medium text-success">
                      <span
                        className="h-2 w-2 rounded-full bg-success"
                        aria-hidden="true"
                      />
                      {site.pages.projects.detail.statusValue}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{site.pages.projects.detail.license}</dt>
                    <dd className="font-medium text-foreground">{site.pages.projects.detail.licenseValue}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{site.pages.projects.detail.language}</dt>
                    <dd className="font-medium text-foreground">
                      {frontmatter.tags
                        .filter((t) =>
                          ['C++', 'Python', 'Go', 'Rust', 'TypeScript', 'JavaScript'].includes(t),
                        )
                        .join(', ') || site.pages.projects.detail.languageFallback}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <h3 className="mb-4 text-lg font-semibold">{site.pages.projects.detail.technologies}</h3>
                <div className="flex flex-wrap gap-2">
                  {frontmatter.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <h3 className="mb-4 text-lg font-semibold">{site.pages.projects.detail.related}</h3>
                <ul className="space-y-2 text-sm">
                  <li>
                    <LocalizedLink href="/projects" className="text-muted-foreground hover:text-primary">
                      ← {site.pages.projects.detail.allProjects}
                    </LocalizedLink>
                  </li>
                  <li>
                    <LocalizedLink href="/writeups" className="text-muted-foreground hover:text-primary">
                      {site.pages.projects.detail.allWriteups}
                    </LocalizedLink>
                  </li>
                  <li>
                    <LocalizedLink href="/lab" className="text-muted-foreground hover:text-primary">
                      {site.pages.projects.detail.lab}
                    </LocalizedLink>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </aside>

          <div className="space-y-6 lg:col-span-3">
            {untranslated && <UntranslatedNotice />}
            <MDXRemote source={content} components={MDXComponents({ site })} />
          </div>
        </div>
      </div>
    </article>
  );
}