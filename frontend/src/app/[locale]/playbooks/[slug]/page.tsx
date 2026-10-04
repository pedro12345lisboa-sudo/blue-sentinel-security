import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { ArrowLeft, ExternalLink, FlaskConical, Radio } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MDXComponents } from '@/components/mdx-components';
import { UntranslatedNotice } from '@/components/common/untranslated-notice';
import { Checklist } from '@/components/playbooks/checklist';
import { DecisionTree } from '@/components/playbooks/decision-tree';
import { PrintButton } from '@/components/playbooks/print-button';
import { SeverityBadge } from '@/components/playbooks/severity-badge';
import { TimelineStep } from '@/components/playbooks/timeline-step';
import {
  getPlaybookBySlug,
  labScenarioTitle,
  ruleFileUrl,
  type PhaseKey,
} from '@/lib/playbooks';
import { LocalizedLink, getSite, pageMetadata, type Locale } from '@/i18n';

interface PlaybookPageProps {
  params: { slug: string; locale: Locale };
}

export function generateMetadata({ params }: PlaybookPageProps): Metadata {
  const site = getSite(params.locale);
  const playbook = getPlaybookBySlug(params.locale, params.slug);
  if (!playbook) {
    return pageMetadata(params.locale, {
      title: `${site.pages.playbooks.labels.notFound} | ${site.brand.fullName}`,
      path: `/playbooks/${params.slug}`,
    });
  }
  return pageMetadata(params.locale, {
    title: playbook.frontmatter.title,
    description: playbook.frontmatter.description,
    path: `/playbooks/${params.slug}`,
  });
}

export default function PlaybookPage({ params }: PlaybookPageProps) {
  const site = getSite(params.locale);
  const doc = getPlaybookBySlug(params.locale, params.slug);

  if (!doc) {
    notFound();
  }

  const playbook = doc.frontmatter;
  const pb = site.pages.playbooks;
  const labels = pb.labels;
  const scenarioName = playbook.labScenario
    ? labScenarioTitle(site.pages.lab.scenarios, playbook.labScenario)
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
            {labels.back}
          </LocalizedLink>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <SeverityBadge severity={playbook.severity} />
            <Badge variant="outline">{pb.types[playbook.type]}</Badge>
            {playbook.updated && (
              <span className="text-xs text-muted-foreground">
                {labels.updated} {playbook.updated}
              </span>
            )}
          </div>

          <h1 className="text-display-md mb-4 font-display font-bold tracking-tight text-balance">
            {playbook.title}
          </h1>
          <p className="mb-8 max-w-3xl text-lg text-muted-foreground text-balance">
            {playbook.description}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            {playbook.labScenario && scenarioName && (
              <LocalizedLink
                href={`/lab?scenario=${encodeURIComponent(playbook.labScenario)}`}
                className="btn-primary no-print"
              >
                <FlaskConical className="mr-2 h-4 w-4" aria-hidden="true" />
                {labels.lab}
              </LocalizedLink>
            )}
            <PrintButton label={labels.print} />
            {playbook.labScenario && scenarioName && (
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
                  <Radio className="h-4 w-4 text-primary" aria-hidden="true" />
                  {labels.trigger}
                </h3>
                <p className="mb-4 text-sm text-muted-foreground">{playbook.trigger.description}</p>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {labels.rules}
                </p>
                <ul className="space-y-2">
                  {playbook.trigger.rules.map((rule) => (
                    <li key={rule.id}>
                      <a
                        href={ruleFileUrl(site.contacts.repository, rule.path)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all font-mono text-sm text-primary hover:underline"
                      >
                        {rule.id}
                        <ExternalLink className="ml-1 inline h-3 w-3" aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <h3 className="mb-3 text-lg font-semibold">{labels.dataSources}</h3>
                <ul className={listClass}>
                  {playbook.dataSources.map((source) => (
                    <li key={source}>{source}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <h3 className="mb-3 text-lg font-semibold">{labels.metrics}</h3>
                <dl className="space-y-4 text-sm">
                  <div>
                    <dt className="text-muted-foreground">{labels.mttd}</dt>
                    <dd className="font-medium text-foreground">{playbook.metrics.mttd}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{labels.mttr}</dt>
                    <dd className="font-medium text-foreground">{playbook.metrics.mttr}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </aside>

          <div className="space-y-12 lg:col-span-2">
            <MDXRemote source={doc.content} components={MDXComponents({ site })} />

            <section aria-labelledby="triage-title">
              <h2 id="triage-title" className="heading-section">
                {labels.triage}
              </h2>
              <Checklist
                storageKey={`${playbook.slug}:triage`}
                ariaLabel={labels.triage}
                labels={{
                  progressLabel: labels.checklistProgress,
                  resetLabel: labels.checklistReset,
                }}
                sections={[{ items: playbook.triage }]}
              />
            </section>

            <section aria-labelledby="decision-tree-title">
              <h2 id="decision-tree-title" className="heading-section">
                {labels.decisionTree}
              </h2>
              <DecisionTree
                code={playbook.decisionTree}
                title={playbook.title}
                sourceLabel={labels.decisionTreeSource}
              />
            </section>

            <section aria-labelledby="response-title">
              <h2 id="response-title" className="heading-section">
                {labels.response}
              </h2>
              <TimelineStep
                steps={playbook.phases.map((phase) => ({
                  key: phase.key,
                  title: labels.phases[phase.key as PhaseKey],
                  summary: phase.summary,
                }))}
              />
            </section>

            <section aria-labelledby="checklist-title">
              <h2 id="checklist-title" className="heading-section">
                {labels.checklistSection}
              </h2>
              <Checklist
                storageKey={`${playbook.slug}:response`}
                ariaLabel={labels.checklistSection}
                labels={{
                  groupLabel: labels.checklist,
                  progressLabel: labels.checklistProgress,
                  resetLabel: labels.checklistReset,
                }}
                sections={playbook.checklist}
              />
            </section>

            <section aria-labelledby="evidence-title">
              <h2 id="evidence-title" className="heading-section">
                {labels.evidence}
              </h2>
              <ul className={listClass}>
                {playbook.evidence.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="comms-title">
              <h2 id="comms-title" className="heading-section">
                {labels.comms}
              </h2>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/50 text-left">
                    <th className="border border-border p-3 font-semibold">{labels.commsWhen}</th>
                    <th className="border border-border p-3 font-semibold">{labels.commsWho}</th>
                  </tr>
                </thead>
                <tbody>
                  {playbook.comms.map((row) => (
                    <tr key={`${row.when}-${row.who}`}>
                      <td className="border border-border p-3 align-top text-muted-foreground">
                        {row.when}
                      </td>
                      <td className="border border-border p-3 align-top text-muted-foreground">
                        {row.who}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section aria-labelledby="lessons-title">
              <h2 id="lessons-title" className="heading-section">
                {labels.lessons}
              </h2>
              <ul className={listClass}>
                {playbook.lessons.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="references-title">
              <h2 id="references-title" className="heading-section">
                {labels.references}
              </h2>
              <ol className="list-decimal space-y-2 text-sm leading-relaxed text-muted-foreground">
                {playbook.references.map((reference) => (
                  <li key={reference}>{reference}</li>
                ))}
              </ol>
            </section>
          </div>
        </div>
      </div>
    </article>
  );
}
