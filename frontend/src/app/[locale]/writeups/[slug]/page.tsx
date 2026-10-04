import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { ArrowLeft, Calendar, Clock, Tag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { MDXComponents } from '@/components/mdx-components';
import { ShareButtons } from '@/components/writeups/share-buttons';
import { getWriteupBySlug } from '@/lib/writeups';
import { extractHeadings } from '@/lib/slugify';
import { TableOfContents } from '@/components/common/table-of-contents';
import { UntranslatedNotice } from '@/components/common/untranslated-notice';
import {
  LocalizedLink,
  formatDate,
  formatReadingTime,
  getSite,
  pageMetadata,
  siteUrl,
  withLocale,
  type Locale,
} from '@/i18n';

interface WriteupPageProps {
  params: { slug: string; locale: Locale };
}

export function generateMetadata({ params }: WriteupPageProps): Metadata {
  const site = getSite(params.locale);
  const writeup = getWriteupBySlug(params.locale, params.slug);
  if (!writeup) {
    return pageMetadata(params.locale, {
      title: `${site.pages.writeups.labels.notFound} | ${site.brand.fullName}`,
      path: `/writeups/${params.slug}`,
      type: 'article',
    });
  }
  const base = pageMetadata(params.locale, {
    title: writeup.frontmatter.title,
    description: writeup.frontmatter.description,
    path: `/writeups/${params.slug}`,
    type: 'article',
    image: writeup.frontmatter.cover ?? writeup.frontmatter.coverImage,
  });
  return {
    ...base,
    openGraph: {
      ...base.openGraph,
      type: 'article' as const,
      publishedTime: writeup.frontmatter.date,
      modifiedTime: writeup.frontmatter.updated ?? writeup.frontmatter.date,
      tags: writeup.frontmatter.tags,
    },
  };
}

export default function WriteupPage({ params }: WriteupPageProps) {
  const site = getSite(params.locale);
  const writeup = getWriteupBySlug(params.locale, params.slug);

  if (!writeup) {
    notFound();
  }

  const { frontmatter, content, untranslated } = writeup;
  const readingMinutes =
    frontmatter.readingTime ||
    Math.max(1, Math.ceil(content.split(/\s+/).length / 200));
  const headings = extractHeadings(content);
  const canonical = new URL(
    withLocale(`/writeups/${params.slug}`, params.locale),
    siteUrl()
  ).toString();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: frontmatter.title,
    description: frontmatter.description,
    ...(frontmatter.cover
      ? { image: new URL(frontmatter.cover, siteUrl()).toString() }
      : {}),
    datePublished: frontmatter.date,
    dateModified: frontmatter.updated ?? frontmatter.date,
    inLanguage: params.locale === 'en' ? 'en' : 'pt-BR',
    keywords: frontmatter.tags.join(', '),
    wordCount: content.split(/\s+/).filter(Boolean).length,
    author: { '@type': 'Person', name: site.brand.fullName },
    publisher: { '@type': 'Organization', name: site.brand.fullName },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
  };

  return (
    <article className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header className="section relative overflow-hidden">
        <div className="gradient-mesh absolute inset-0" aria-hidden="true" />
        <div className="noise-overlay absolute inset-0" aria-hidden="true" />
        <div className="container-wide relative">
          <LocalizedLink
            href="/writeups"
            className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {site.pages.writeups.labels.back}
          </LocalizedLink>

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
              <time dateTime={frontmatter.date}>{formatDate(frontmatter.date, params.locale)}</time>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" aria-hidden="true" />
              <span>{formatReadingTime(readingMinutes, params.locale, site.pages.writeups.labels.minRead)}</span>
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
            {headings.length > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <TableOfContents headings={headings} className="static max-h-none overflow-visible" />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="pt-6">
                <h2 className="mb-4 text-lg font-semibold">{site.pages.writeups.labels.info}</h2>
                <dl className="space-y-4 text-sm">
                  <div>
                    <dt className="text-muted-foreground">{site.pages.writeups.labels.published}</dt>
                    <dd className="font-medium text-foreground">
                      {formatDate(frontmatter.date, params.locale)}
                    </dd>
                  </div>
                  {frontmatter.updated && (
                    <div>
                      <dt className="text-muted-foreground">{site.pages.writeups.labels.updated}</dt>
                      <dd className="font-medium text-foreground">
                        {formatDate(frontmatter.updated, params.locale)}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-muted-foreground">{site.pages.writeups.labels.readingTime}</dt>
                    <dd className="font-medium text-foreground">
                      {formatReadingTime(readingMinutes, params.locale, site.pages.writeups.labels.min)}
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
                <h2 className="mb-4 text-lg font-semibold">{site.pages.writeups.labels.tagsTitle}</h2>
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
                <h2 className="mb-4 text-lg font-semibold">{site.pages.writeups.labels.moreReading}</h2>
                <ul className="space-y-2 text-sm">
                  <li>
                    <LocalizedLink href="/writeups" className="text-muted-foreground hover:text-primary">
                      ← {site.pages.writeups.labels.allWriteups}
                    </LocalizedLink>
                  </li>
                  <li>
                    <LocalizedLink href="/projects" className="text-muted-foreground hover:text-primary">
                      {site.pages.writeups.labels.relatedProjects}
                    </LocalizedLink>
                  </li>
                  <li>
                    <LocalizedLink href="/lab" className="text-muted-foreground hover:text-primary">
                      {site.pages.writeups.labels.relatedLab}
                    </LocalizedLink>
                  </li>
                  <li>
                    <LocalizedLink href="/playbooks" className="text-muted-foreground hover:text-primary">
                      {site.pages.writeups.labels.relatedPlaybooks}
                    </LocalizedLink>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </aside>

          <div className="lg:col-span-3">
            {untranslated && <UntranslatedNotice className="mb-8" />}
            {frontmatter.cover && (
              <Image
                src={frontmatter.cover}
                alt=""
                width={1200}
                height={630}
                className="mb-8 h-auto w-full rounded-xl border border-border/50"
              />
            )}
            <MDXRemote source={content} components={MDXComponents({ site })} />

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