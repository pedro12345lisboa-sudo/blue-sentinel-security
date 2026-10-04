import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { ArrowLeft, Database, ExternalLink, FlaskConical, Target } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CodeBlock } from '@/components/common/code-block';
import { MDXComponents } from '@/components/mdx-components';
import { UntranslatedNotice } from '@/components/common/untranslated-notice';
import { PrintButton } from '@/components/playbooks/print-button';
import { SeverityBadge } from '@/components/playbooks/severity-badge';
import { getHypothesisBySlug, labScenarioTitle } from '@/lib/playbooks';
import { LocalizedLink, getSite, pageMetadata, type Locale } from '@/i18n';

interface HypothesisPageProps {
  params: { slug: string; locale: Locale };
}

export function generateMetadata({ params }: HypothesisPageProps): Metadata {
  const site = getSite(params.locale);
  const hypothesis = getHypothesisBySlug(params.locale, params.slug);
  if (!hypothesis) {
    return pageMetadata(params.locale, {
      title: `${site.pages.playbooks.labels.hunting.notFound} | ${site.brand.fullName}`,
      path: `/playbooks/hunting/${params.slug}`,
    });
  }
  return pageMetadata(params.locale, {
    title: hypothesis.frontmatter.title,
    description: hypothesis.frontmatter.description,
    path: `/playbooks/hunting/${params.slug}`,
  });
}

export default function HypothesisPage({ params }: HypothesisPageProps) {
  const site = getSite(params.locale);
  const doc = getHypothesisBySlug(params.locale, params.slug);

  if (!doc) {
    notFound();
  }

  const hypothesis = doc.frontmatter;
  const labels = site.pages.playbooks.labels;
  const hunting = labels.hunting;
  const scenarioName = hypothesis.labScenario
    ? labScenarioTitle(site.pages.lab.scenarios, hypothesis.labScenario)
    : null;
  const listClass = 'list-disc space-y-2 text-sm leading-relaxed text-muted-foreground';

  return (
    <article className="min-h-screen">
      <header className="section relative overflow-hidden">
        <div className="gradient-mesh absolute inset-0" aria-hidden="true" />
        <div className="noise-overlay absolute inset-0" aria-hidden="true" />
        <div className="container-wide relative">
          <LocalizedLink
            href="/playbooks"
            className="no-print mb-8 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {hunting.back}
          </LocalizedLink>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <SeverityBadge severity={hypothesis.severity} />
            <Badge variant="outline" className="font-mono">
              {hypothesis.technique}
            </Badge>
            <Badge variant="secondary">{hypothesis.techniqueName}</Badge>
          </div>

          <h1 className="text-display-md mb-4 font-display font-bold tracking-tight text-balance">
            {hypothesis.title}
          </h1>
          <p className="mb-8 max-w-3xl text-lg text-muted-foreground text-balance">
            {hypothesis.description}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            {hypothesis.labScenario && scenarioName && (
              <LocalizedLink
                href={`/lab?scenario=${encodeURIComponent(hypothesis.labScenario)}`}
                className="btn-primary no-print"
              >
                <FlaskConical className="mr-2 h-4 w-4" aria-hidden="true" />
                {labels.lab}
              </LocalizedLink>
            )}
            <PrintButton label={labels.print} />
            {hypothesis.labScenario && scenarioName && (
              <span className="text-sm text-muted-foreground">{scenarioName}</span>
            )}
          </div>
        </div>
      </header>

      <div className="container-wide px-6 py-16">
        {doc.untranslated && <UntranslatedNotice className="mb-8" />}

        <div className="grid gap-12 lg:grid-cols-3">
          <aside className="space-y-6 lg:col-span-1">
            <Card>
              <CardContent className="pt-6">
                <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold">
                  <Target className="h-4 w-4 text-primary" aria-hidden="true" />
                  {hunting.techniqueTitle}
                </h3>
                <p className="font-mono text-sm text-primary">{hypothesis.technique}</p>
                <p className="mt-1 text-sm text-muted-foreground">{hypothesis.techniqueName}</p>
                <a
                  href={`https://attack.mitre.org/technique/${hypothesis.technique.split('.')[0]}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  MITRE ATT&CK
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold">
                  <Database className="h-4 w-4 text-primary" aria-hidden="true" />
                  {hunting.dataSource}
                </h3>
                <p className="text-sm text-muted-foreground">{hypothesis.dataSource}</p>
              </CardContent>
            </Card>
          </aside>

          <div className="space-y-12 lg:col-span-2">
            <MDXRemote source={doc.content} components={MDXComponents({ site })} />

            <section aria-labelledby="hypothesis-title">
              <h2 id="hypothesis-title" className="heading-section">
                {hunting.hypothesis}
              </h2>
              <blockquote className="border-l-4 border-primary pl-4 italic text-foreground">
                {hypothesis.hypothesis}
              </blockquote>
            </section>

            <section aria-labelledby="query-title">
              <h2 id="query-title" className="heading-section">
                {hunting.query}
              </h2>
              <CodeBlock language="pseudocode">{hypothesis.query}</CodeBlock>
            </section>

            <section aria-labelledby="normal-title">
              <h2 id="normal-title" className="heading-section">
                {hunting.normal}
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{hypothesis.normal}</p>
            </section>

            <section aria-labelledby="escalation-title">
              <h2 id="escalation-title" className="heading-section">
                {hunting.escalation}
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{hypothesis.escalation}</p>
            </section>

            <section aria-labelledby="sigma-title">
              <h2 id="sigma-title" className="heading-section">
                {hunting.sigma}
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{hypothesis.sigma}</p>
            </section>

            {hypothesis.references.length > 0 && (
              <section aria-labelledby="hunting-references-title">
                <h2 id="hunting-references-title" className="heading-section">
                  {labels.references}
                </h2>
                <ol className="list-decimal space-y-2 text-sm leading-relaxed text-muted-foreground">
                  {hypothesis.references.map((reference) => (
                    <li key={reference}>{reference}</li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
