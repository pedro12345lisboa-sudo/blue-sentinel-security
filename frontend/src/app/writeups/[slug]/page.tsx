import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { ArrowLeft, Calendar, Clock, Tag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { MDXComponents } from '@/components/mdx-components';
import { ShareButtons } from '@/components/writeups/share-buttons';
import { getWriteupBySlug } from '@/lib/writeups';
import { site } from '../../../../content/site';

interface WriteupPageProps {
  params: { slug: string };
}

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('pt-BR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

export async function generateMetadata({
  params,
}: WriteupPageProps): Promise<Metadata> {
  const writeup = getWriteupBySlug(params.slug);
  if (!writeup) {
    return {
      title: `${site.pages.writeups.labels.notFound} | ${site.brand.fullName}`,
    };
  }
  return {
    title: writeup.frontmatter.title,
    description: writeup.frontmatter.description,
    openGraph: {
      title: writeup.frontmatter.title,
      description: writeup.frontmatter.description,
      type: 'article',
      publishedTime: writeup.frontmatter.date,
      tags: writeup.frontmatter.tags,
    },
  };
}

export default function WriteupPage({ params }: WriteupPageProps) {
  const writeup = getWriteupBySlug(params.slug);

  if (!writeup) {
    notFound();
  }

  const { frontmatter, content } = writeup;
  const readingMinutes =
    frontmatter.readingTime ||
    Math.max(1, Math.ceil(content.split(/\s+/).length / 200));

  return (
    <article className="min-h-screen">
      <header className="section relative overflow-hidden">
        <div className="gradient-mesh absolute inset-0" aria-hidden="true" />
        <div className="noise-overlay absolute inset-0" aria-hidden="true" />
        <div className="container-wide relative">
          <Link
            href="/writeups"
            className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {site.pages.writeups.labels.back}
          </Link>

          {frontmatter.series && (
            <Badge variant="secondary" className="mb-4 w-fit">
              {frontmatter.series}
            </Badge>
          )}

          <h1 className="mb-4 text-balance font-display text-display-md font-bold tracking-tight">
            {frontmatter.title}
          </h1>

          <p className="mb-8 max-w-3xl text-balance text-lg text-muted-foreground">
            {frontmatter.description}
          </p>

          <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" aria-hidden="true" />
              <time dateTime={frontmatter.date}>{formatDate(frontmatter.date)}</time>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" aria-hidden="true" />
              <span>{readingMinutes} {site.pages.writeups.labels.minRead}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Tag className="h-4 w-4" aria-hidden="true" />
              <span>{frontmatter.tags.length} {site.pages.writeups.labels.tags}</span>
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

          <div className="mt-8">
            <ShareButtons title={frontmatter.title} variant="compact" />
          </div>
        </div>
      </header>

      <div className="container-wide px-6 py-16">
        <div className="grid gap-12 lg:grid-cols-4">
          <aside className="space-y-8 lg:col-span-1">
            <Card>
              <CardContent className="pt-6">
                <h3 className="mb-4 text-lg font-semibold">{site.pages.writeups.labels.info}</h3>
                <dl className="space-y-4 text-sm">
                  <div>
                    <dt className="text-muted-foreground">{site.pages.writeups.labels.published}</dt>
                    <dd className="font-medium text-foreground">
                      {formatDate(frontmatter.date)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{site.pages.writeups.labels.readingTime}</dt>
                    <dd className="font-medium text-foreground">
                      {readingMinutes} {site.pages.writeups.labels.min}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{site.pages.writeups.labels.category}</dt>
                    <dd className="font-medium text-foreground">{frontmatter.tags[0]}</dd>
                  </div>
                  {frontmatter.series && (
                    <div>
                      <dt className="text-muted-foreground">{site.pages.writeups.labels.series}</dt>
                      <dd className="font-medium text-foreground">{frontmatter.series}</dd>
                    </div>
                  )}
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <h3 className="mb-4 text-lg font-semibold">{site.pages.writeups.labels.tagsTitle}</h3>
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
                <h3 className="mb-4 text-lg font-semibold">{site.pages.writeups.labels.moreReading}</h3>
                <ul className="space-y-2 text-sm">
                  <li>
                    <Link href="/writeups" className="text-muted-foreground hover:text-primary">
                      ← {site.pages.writeups.labels.allWriteups}
                    </Link>
                  </li>
                  <li>
                    <Link href="/projects" className="text-muted-foreground hover:text-primary">
                      {site.pages.writeups.labels.relatedProjects}
                    </Link>
                  </li>
                  <li>
                    <Link href="/lab" className="text-muted-foreground hover:text-primary">
                      {site.pages.writeups.labels.relatedLab}
                    </Link>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </aside>

          <div className="lg:col-span-3">
            <MDXRemote source={content} components={MDXComponents({})} />

            <div className="mt-16 border-t border-border/50 pt-8">
              <h2 className="mb-6 text-xl font-semibold">{site.pages.writeups.labels.share}</h2>
              <ShareButtons title={frontmatter.title} variant="full" />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}