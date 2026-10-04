import type { Metadata } from 'next';
import { Bug, Database, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PlaybooksExplorer } from '@/components/playbooks/explorer';
import { SeverityBadge } from '@/components/playbooks/severity-badge';
import { getAllHypotheses, getAllPlaybooks } from '@/lib/playbooks';
import { LocalizedLink, getSite, pageMetadata, type Locale } from '@/i18n';

interface PlaybooksProps {
  params: { locale: Locale };
}

export function generateMetadata({ params }: PlaybooksProps): Metadata {
  const site = getSite(params.locale);
  return pageMetadata(params.locale, {
    title: site.seo.playbooks.title,
    description: site.seo.playbooks.description,
    path: '/playbooks',
  });
}

export default function PlaybooksPage({ params }: PlaybooksProps) {
  const site = getSite(params.locale);
  const pb = site.pages.playbooks;
  const playbooks = getAllPlaybooks(params.locale);
  const hypotheses = getAllHypotheses(params.locale);

  const items = playbooks.map((playbook) => ({
    slug: playbook.slug,
    title: playbook.title,
    description: playbook.description,
    severity: playbook.severity,
    type: playbook.type,
    ruleCount: playbook.trigger.rules.length,
  }));

  return (
    <div className="min-h-screen">
      <section className="section relative overflow-hidden">
        <div className="gradient-mesh absolute inset-0" aria-hidden="true" />
        <div className="noise-overlay absolute inset-0" aria-hidden="true" />
        <div className="container-wide relative">
          <div className="max-w-3xl">
            <h1 className="text-display-lg mb-4 font-display font-bold tracking-tight">
              {pb.title}
            </h1>
            <p className="text-balance text-lg text-muted-foreground">{pb.description}</p>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="playbooks-list-title">
        <div className="container-wide">
          <div className="mb-8 flex items-center gap-3">
            <Shield className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 id="playbooks-list-title" className="heading-section !mb-0">
              {pb.sections.playbooks}
            </h2>
          </div>
          <PlaybooksExplorer items={items} labels={{ ...pb.filters, severities: pb.severity, types: pb.types }} />
        </div>
      </section>

      <section
        className="section bg-gradient-to-b from-background to-card/50"
        aria-labelledby="hunting-list-title"
      >
        <div className="container-wide">
          <div className="mb-4 flex items-center gap-3">
            <Bug className="h-5 w-5 text-accent" aria-hidden="true" />
            <h2 id="hunting-list-title" className="heading-section !mb-0">
              {pb.sections.hunting}
            </h2>
          </div>
          <p className="mb-8 max-w-3xl text-muted-foreground">{pb.sections.huntingDescription}</p>

          <div className="grid gap-6 lg:grid-cols-3">
            {hypotheses.map((hypothesis) => (
              <article key={hypothesis.slug} className="flex">
                <LocalizedLink
                  href={`/playbooks/hunting/${hypothesis.slug}`}
                  className="flex w-full flex-col rounded-2xl border border-border/50 bg-card/60 p-6 transition-all duration-300 hover:border-accent/40 hover:bg-card hover:shadow-glow"
                >
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={hypothesis.severity} size="sm" />
                    <Badge variant="outline" className="font-mono text-xs">
                      {hypothesis.technique}
                    </Badge>
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">{hypothesis.title}</h3>
                  <p className="line-clamp-3 text-sm text-muted-foreground">
                    {hypothesis.description}
                  </p>
                  <p className="mt-4 flex items-center gap-1.5 border-t border-border/50 pt-4 text-xs text-muted-foreground">
                    <Database className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {hypothesis.dataSource}
                  </p>
                </LocalizedLink>
              </article>
            ))}
          </div>

          {hypotheses.length === 0 && (
            <p className="py-12 text-center text-muted-foreground">{pb.labels.hunting.empty}</p>
          )}
        </div>
      </section>
    </div>
  );
}
