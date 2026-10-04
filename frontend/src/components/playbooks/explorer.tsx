'use client';

import * as React from 'react';
import { ArrowRight, Filter } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LocalizedLink } from '@/i18n';
import type { IncidentSeverity, IncidentType } from '@/lib/playbooks';
import { SeverityBadge } from './severity-badge';

export interface PlaybookCardItem {
  slug: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  type: IncidentType;
  ruleCount: number;
}

export interface ExplorerLabels {
  severityLabel: string;
  typeLabel: string;
  allSeverities: string;
  allTypes: string;
  count: string;
  countOne: string;
  empty: string;
  open: string;
  rulesCount: string;
  rulesCountOne: string;
  severities: Record<IncidentSeverity, string>;
  types: Record<IncidentType, string>;
}

const SEVERITY_ORDER: IncidentSeverity[] = ['critical', 'high', 'medium', 'low'];

interface PlaybooksExplorerProps {
  items: PlaybookCardItem[];
  labels: ExplorerLabels;
}

/**
 * Listagem dos playbooks com filtro por severidade e por tipo de incidente.
 * Estado apenas no navegador do visitante (nenhum dado sai do client).
 */
export function PlaybooksExplorer({ items, labels }: PlaybooksExplorerProps) {
  const [severity, setSeverity] = React.useState('all');
  const [type, setType] = React.useState('all');

  const severities = React.useMemo(
    () =>
      SEVERITY_ORDER.filter((value) => items.some((item) => item.severity === value)),
    [items]
  );
  const types = React.useMemo(
    () =>
      (Object.keys(labels.types) as IncidentType[]).filter((value) =>
        items.some((item) => item.type === value)
      ),
    [items, labels.types]
  );

  const filtered = items.filter(
    (item) =>
      (severity === 'all' || item.severity === severity) &&
      (type === 'all' || item.type === type)
  );

  return (
    <div className="space-y-8">
      <div className="no-print flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <div className="space-y-1">
            <label htmlFor="playbook-severity" className="label-base block">
              {labels.severityLabel}
            </label>
            <select
              id="playbook-severity"
              className="input-base w-auto min-w-[180px] bg-background"
              value={severity}
              onChange={(event) => setSeverity(event.target.value)}
            >
              <option value="all">{labels.allSeverities}</option>
              {severities.map((value) => (
                <option key={value} value={value}>
                  {labels.severities[value]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="playbook-type" className="label-base block">
            {labels.typeLabel}
          </label>
          <select
            id="playbook-type"
            className="input-base w-auto min-w-[220px] bg-background"
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="all">{labels.allTypes}</option>
            {types.map((value) => (
              <option key={value} value={value}>
                {labels.types[value]}
              </option>
            ))}
          </select>
        </div>

        <p className="text-sm text-muted-foreground sm:ml-auto" aria-live="polite">
          {filtered.length} {filtered.length === 1 ? labels.countOne : labels.count}
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/60 p-8 text-center text-muted-foreground">
          {labels.empty}
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {filtered.map((item) => (
            <article key={item.slug} className="flex">
              <LocalizedLink
                href={`/playbooks/${item.slug}`}
                className="flex w-full flex-col rounded-2xl border border-border/50 bg-card/50 p-6 transition-all duration-300 hover:border-primary/30 hover:bg-card hover:shadow-glow"
              >
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={item.severity} size="sm" />
                  <Badge variant="outline" className="text-xs">
                    {labels.types[item.type]}
                  </Badge>
                </div>
                <h3 className="mb-2 text-lg font-semibold">{item.title}</h3>
                <p className="mb-4 line-clamp-3 text-sm text-muted-foreground">
                  {item.description}
                </p>
                <div className="mt-auto flex items-center justify-between border-t border-border/50 pt-4 text-xs text-muted-foreground">
                  <span>
                    {item.ruleCount}{' '}
                    {item.ruleCount === 1 ? labels.rulesCountOne : labels.rulesCount}
                  </span>
                  <Button variant="ghost" size="sm" asChild>
                    <LocalizedLink href={`/playbooks/${item.slug}`}>
                      {labels.open}
                      <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    </LocalizedLink>
                  </Button>
                </div>
              </LocalizedLink>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
