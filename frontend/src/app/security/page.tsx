import type { Metadata } from 'next';
import { Shield, Lock, Globe, Database, Code, Search, AlertTriangle, CheckCircle, Mail, Github, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { site } from '../../../content/site';

export const metadata: Metadata = {
  title: site.seo.security.title,
  description: site.seo.security.description,
};

const security = site.pages.security;

const measureIcons: Record<string, LucideIcon> = {
  Globe,
  Lock,
  Database,
  Shield,
  Search,
  AlertTriangle,
  Code,
  CheckCircle,
};

export default function SecurityPage() {
  const measureStatus = (status: string) =>
    status === 'implemented'
      ? { label: security.status.implemented, variant: 'success' as const }
      : status === 'partial'
        ? { label: security.status.partial, variant: 'warning' as const }
        : { label: security.status.planned, variant: 'secondary' as const };

  const threatStatus = (status: string) =>
    status === 'mitigated'
      ? { label: security.mitigated, variant: 'success' as const }
      : status === 'partial'
        ? { label: security.partial, variant: 'warning' as const }
        : { label: security.status.planned, variant: 'secondary' as const };

  return (
    <div className="min-h-screen">
      <section className="section relative overflow-hidden">
        <div className="absolute inset-0 gradient-mesh" aria-hidden="true" />
        <div className="absolute inset-0 noise-overlay" aria-hidden="true" />
        <div className="container-wide relative">
          <div className="max-w-3xl">
            <h1 className="mb-4 text-display-lg font-display font-bold tracking-tight">
              {security.title}
            </h1>
            <p className="text-lg text-muted-foreground text-balance">
              {security.description}
            </p>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="measures-title">
        <div className="container-wide">
          <h2 id="measures-title" className="mb-12 text-center heading-section text-display-md">
            {security.measuresTitle}
          </h2>

          {security.measures.map((section) => (
            <section key={section.category} className="mb-16" aria-labelledby={`${section.category}-title`}>
              <h3 id={`${section.category}-title`} className="mb-8 text-2xl font-semibold text-center">
                {section.category}
              </h3>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {section.items.map((item) => {
                  const Icon = measureIcons[item.icon] ?? Shield;
                  const status = measureStatus(item.status);
                  return (
                    <Card key={item.title} className="group hover:border-primary/30 hover:shadow-glow transition-all">
                      <CardHeader>
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <CardTitle className="text-lg">{item.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                        <div className="flex items-center justify-between pt-3 border-t border-border/50">
                          <Badge variant={status.variant}>
                            {status.label}
                          </Badge>
                          <span className="text-xs font-mono text-muted-foreground">
                            {security.verified}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </section>

      <section className="section bg-gradient-to-b from-background to-card/50" aria-labelledby="threats-title">
        <div className="container-wide">
          <div className="mb-12 text-center">
            <h2 id="threats-title" className="heading-section text-display-md mb-4">
              {security.threatTitle}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {security.threatDescription}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full" role="table">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left p-4 font-semibold">{security.columns.threat}</th>
                  <th className="text-left p-4 font-semibold">{security.columns.mitigation}</th>
                  <th className="text-center p-4 font-semibold">{security.columns.status}</th>
                </tr>
              </thead>
              <tbody>
                {security.threats.map((item) => {
                  const status = threatStatus(item.status);
                  return (
                    <tr key={item.threat} className="border-b border-border/50 hover:bg-card/50 transition-colors">
                      <td className="p-4">
                        <code className="font-mono text-sm">{item.threat}</code>
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">{item.mitigation}</td>
                      <td className="p-4 text-center">
                        <Badge variant={status.variant}>
                          {status.label}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section bg-gradient-to-b from-card/50 to-background" aria-labelledby="disclosure-title">
        <div className="container-wide">
          <div className="max-w-2xl mx-auto text-center">
            <h2 id="disclosure-title" className="heading-section text-display-md mb-6">
              {security.disclosureTitle}
            </h2>
            <div className="space-y-6 text-lg text-muted-foreground text-balance">
              <p>
                {security.disclosureIntro}
              </p>
              <div className="space-y-4 text-left">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-card border border-border/50">
                  <Mail className="h-6 w-6 text-primary flex-shrink-0" aria-hidden="true" />
                  <div>
                    <h4 className="font-semibold text-foreground">{security.disclosureEmail}</h4>
                    <a href={`mailto:${site.contacts.security}`} className="text-primary hover:underline">
                      {site.contacts.security}
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-lg bg-card border border-border/50">
                  <Github className="h-6 w-6 text-primary flex-shrink-0" aria-hidden="true" />
                  <div>
                    <h4 className="font-semibold text-foreground">{security.disclosureGithub}</h4>
                    <a
                      href={site.contacts.issues}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {security.disclosureReport}
                    </a>
                  </div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground/70">
                {security.disclosureSlack}
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
