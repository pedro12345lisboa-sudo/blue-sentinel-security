'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Loader2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { API_BASE } from '@/services/api';
import { useSite } from '@/i18n';
import { SeverityBadge } from './severity-badge';
import type { LabAlert, LabEvent, LabRuleDetail } from './types';

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-xs text-muted-foreground">—</p>;
  return (
    <ul className="space-y-1 text-sm text-foreground/90">
      {items.map((item, index) => (
        <li key={index} className="flex gap-2">
          <span className="text-primary" aria-hidden="true">
            ›
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function ExplanationPanel({
  alert,
  event,
  onClose,
}: {
  alert: LabAlert | null;
  event: LabEvent | null;
  onClose: () => void;
}) {
  const site = useSite();
  const lab = site.pages.lab.explain;
  const [detail, setDetail] = useState<LabRuleDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const cacheRef = useRef<Map<string, LabRuleDetail>>(new Map());

  const ruleId = alert?.rule_id ?? null;

  useEffect(() => {
    if (!ruleId) {
      setDetail(null);
      setFailed(false);
      setLoading(false);
      return;
    }
    const cached = cacheRef.current.get(ruleId);
    if (cached) {
      setDetail(cached);
      setFailed(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    (async () => {
      try {
        const response = await fetch(`${API_BASE}/api/v1/lab/rules/${encodeURIComponent(ruleId)}`);
        if (!response.ok) throw new Error('rule');
        const data = (await response.json()) as LabRuleDetail;
        cacheRef.current.set(ruleId, data);
        if (!cancelled) setDetail(data);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ruleId]);

  const kinds = site.pages.lab.alerts.kind as unknown as Record<string, string>;
  const logLines = useMemo(() => {
    if (!event) return [];
    const lines = [
      `${event.timestamp} ${event.host} ${event.product} ${event.action}`,
      `user=${event.user} ip=${event.ip} category=${event.category} event_id=${event.event_id}`,
    ];
    if (event.process !== '-') lines.push(`process=${event.process}`);
    if (event.command_line !== '-') lines.push(`command_line=${event.command_line}`);
    for (const [key, value] of Object.entries(event.fields)) {
      lines.push(`${key}=${formatValue(value)}`);
    }
    if (event.text) lines.push(`text=${event.text}`);
    return lines;
  }, [event]);

  if (!alert) {
    return (
      <Card>
        <CardContent className="flex min-h-40 items-center justify-center py-10">
          <p className="max-w-md text-center text-sm text-muted-foreground">{lab.empty}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <SeverityBadge severity={alert.severity} />
              <Badge variant="ghost" className="font-mono text-xs uppercase">
                {kinds[alert.kind] ?? alert.kind}
              </Badge>
              <Badge variant="outline" className="font-mono text-xs">
                {alert.rule_id}
              </Badge>
              {alert.count > 1 && (
                <Badge variant="secondary" size="sm" className="font-mono">
                  ×{alert.count}
                </Badge>
              )}
            </div>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="size-4 shrink-0 text-primary" aria-hidden="true" />
              {lab.title}
            </CardTitle>
            <p className="text-sm font-medium">{alert.title}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label={lab.close}>
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            {lab.rule}
          </p>
        )}
        {failed && <p className="text-xs text-destructive">{lab.loadFailed}</p>}

        <Section title={lab.why}>
          <p className="text-sm leading-relaxed text-foreground/90">
            {detail?.description ?? alert.description}
          </p>
        </Section>

        <Section title={lab.matchedFields}>
          {alert.matched_fields.length === 0 ? (
            <p className="text-xs text-muted-foreground">—</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border/60">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/40 text-left text-muted-foreground">
                    <th className="px-2 py-1.5 font-medium">{lab.field}</th>
                    <th className="px-2 py-1.5 font-medium">{lab.operator}</th>
                    <th className="px-2 py-1.5 font-medium">{lab.expected}</th>
                    <th className="px-2 py-1.5 font-medium">{lab.actual}</th>
                  </tr>
                </thead>
                <tbody>
                  {alert.matched_fields.map((binding, index) => (
                    <tr key={index} className="border-b border-border/40 last:border-0">
                      <td className="px-2 py-1.5 font-mono text-primary">{binding.field}</td>
                      <td className="px-2 py-1.5 font-mono">{binding.op}</td>
                      <td className="max-w-56 break-all px-2 py-1.5 font-mono text-muted-foreground">
                        {formatValue(binding.expected)}
                      </td>
                      <td className="max-w-56 break-all px-2 py-1.5 font-mono">{formatValue(binding.actual)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title={lab.matchedLog}>
          <p className="mb-1 font-mono text-xs text-muted-foreground">
            {lab.rule}: {alert.rule_id} · {event ? event.id : alert.event_id} · {alert.timestamp}
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-border/60 bg-background/60 p-2.5 font-mono text-xs leading-relaxed text-foreground/80">
            {logLines.length > 0 ? logLines.join('\n') : '—'}
          </pre>
        </Section>

        <Section title={lab.mitre}>
          {alert.mitre.length === 0 ? (
            <p className="text-xs text-muted-foreground">—</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {alert.mitre.map((technique) => (
                <Badge key={technique} variant="outline" className="font-mono text-xs">
                  {technique}
                </Badge>
              ))}
            </div>
          )}
        </Section>

        {detail?.condition && (
          <Section title={lab.condition}>
            <code className="block break-all rounded-md border border-border/60 bg-background/60 p-2 font-mono text-xs">
              {detail.condition}
            </code>
          </Section>
        )}

        {detail?.logsource && (
          <Section title={lab.logsource}>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(detail.logsource)
                .filter(([, value]) => value !== null && value !== undefined)
                .map(([key, value]) => (
                  <Badge key={key} variant="secondary" size="sm" className="font-mono">
                    {key}: {formatValue(value)}
                  </Badge>
                ))}
            </div>
          </Section>
        )}

        {detail?.strings && detail.strings.length > 0 && (
          <Section title={lab.strings}>
            <ul className="space-y-1 font-mono text-xs">
              {detail.strings.map((entry) => (
                <li key={entry.id} className="break-all">
                  <span className="text-primary">{entry.id}</span> = &quot;{entry.literal}&quot;
                </li>
              ))}
            </ul>
          </Section>
        )}

        {detail?.stages && detail.stages.length > 0 && (
          <Section title={lab.stages}>
            <ol className="space-y-1.5">
              {detail.stages.map((stage, index) => (
                <li key={stage.id} className="flex flex-wrap items-center gap-1.5 text-xs">
                  <Badge variant="outline" size="sm" className="font-mono">
                    {index + 1}. {stage.id}
                  </Badge>
                  <span className="text-muted-foreground">
                    ≥ {stage.min_events} × [{stage.rule_ids.join(', ')}]
                  </span>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {detail?.window_seconds != null && (
          <div className="flex flex-wrap gap-4 text-xs">
            <p>
              <span className="text-muted-foreground">{lab.window}: </span>
              <span className="font-mono">{detail.window_seconds}s</span>
            </p>
            {detail.group_by && detail.group_by.length > 0 && (
              <p>
                <span className="text-muted-foreground">{lab.groupBy}: </span>
                <span className="font-mono">{detail.group_by.join(', ')}</span>
              </p>
            )}
          </div>
        )}

        <Section title={lab.falsePositives}>
          <Bullets items={alert.false_positives} />
        </Section>

        <Section title={lab.response}>
          <Bullets items={alert.response} />
        </Section>

        {detail?.source && (
          <p className="text-xs text-muted-foreground">
            {lab.source}: <span className="font-mono">{detail.source}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
