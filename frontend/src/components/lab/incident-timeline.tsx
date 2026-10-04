'use client';
import { CircleDot, Clock, Siren } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSite } from '@/i18n';
import { SeverityBadge } from './severity-badge';
import type { LabIncident, LabReport } from './types';

export function IncidentTimeline({
  incident,
  report,
}: {
  incident: LabIncident | null;
  report: LabReport | null;
}) {
  const site = useSite();
  const lab = site.pages.lab.incident;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Siren className="size-5 text-warning" aria-hidden="true" />
            {lab.title}
          </CardTitle>
          {incident && (
            <div className="flex items-center gap-2">
              <SeverityBadge severity={incident.severity} />
              <Badge variant={incident.status === 'open' ? 'warning' : 'success'} size="sm" className="uppercase">
                {incident.status === 'open' ? lab.open : lab.resolved}
              </Badge>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!incident && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {report ? lab.notCreated : lab.emptyIdle}
          </p>
        )}

        {incident && (
          <>
            <div className="space-y-1">
              <p className="text-sm font-medium">{incident.title}</p>
              <p className="text-sm text-muted-foreground">{incident.description}</p>
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3.5" aria-hidden="true" />
                  {incident.opened_at.slice(0, 19).replace('T', ' ')}Z
                </span>
                <span>
                  {lab.by}: <span className="font-mono">{incident.opened_by}</span>
                </span>
                <span>
                  {lab.status}: <span className="font-mono">{incident.id}</span>
                </span>
              </p>
            </div>

            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {lab.timeline}
              </h4>
              <ol className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {incident.timeline.map((entry, index) => (
                  <li key={`${entry.ref}-${index}`} className="flex items-start gap-2.5 text-xs">
                    <CircleDot className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono tabular-nums text-muted-foreground">
                          {entry.ts.slice(11, 19)}
                        </span>
                        <Badge variant="ghost" size="sm" className="font-mono uppercase">
                          {entry.kind}
                        </Badge>
                        {entry.severity && <SeverityBadge severity={entry.severity} size="sm" />}
                      </div>
                      <p className="mt-0.5 break-words text-foreground/90">{entry.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {lab.tags}
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {incident.mitre.length === 0 ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    incident.mitre.map((technique) => (
                      <Badge key={technique} variant="outline" size="sm" className="font-mono">
                        {technique}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {lab.expectedRules}
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {incident.expected_rules.length === 0 ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    incident.expected_rules.map((rule) => (
                      <Badge key={rule} variant="secondary" size="sm" className="font-mono">
                        {rule}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {lab.response}
              </h4>
              <ul className="space-y-1 text-sm text-foreground/90">
                {incident.response.length === 0 ? (
                  <li className="text-xs text-muted-foreground">—</li>
                ) : (
                  incident.response.map((step, index) => (
                    <li key={index} className="flex gap-2">
                      <span className="font-mono text-primary" aria-hidden="true">
                        {index + 1}.
                      </span>
                      <span>{step}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
