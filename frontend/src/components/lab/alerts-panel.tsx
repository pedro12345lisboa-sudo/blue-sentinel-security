'use client';

import { AlertTriangle, MousePointerClick } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useSite } from '@/i18n';
import { SeverityBadge } from './severity-badge';
import type { LabAlert } from './types';

export function AlertsPanel({
  alerts,
  selectedId,
  started,
  onSelect,
}: {
  alerts: LabAlert[];
  selectedId: string | null;
  started: boolean;
  onSelect: (id: string) => void;
}) {
  const site = useSite();
  const lab = site.pages.lab;
  const kinds = lab.alerts.kind as unknown as Record<string, string>;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-destructive" aria-hidden="true" />
            {lab.alerts.title}
          </CardTitle>
          <Badge variant={alerts.length > 0 ? 'destructive' : 'outline'} className="font-mono text-xs">
            {alerts.length} {alerts.length === 1 ? lab.alerts.countOne : lab.alerts.count}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-2">
        {alerts.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {started ? lab.alerts.empty : lab.alerts.emptyIdle}
          </p>
        ) : (
          <ul className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
            {alerts.map((alert) => {
              const isSelected = alert.id === selectedId;
              return (
                <li key={alert.id}>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => onSelect(alert.id)}
                    className={cn(
                      'w-full rounded-lg border p-3 text-left transition-colors',
                      isSelected
                        ? 'border-primary/60 bg-primary/5 ring-1 ring-primary/40'
                        : 'border-border/60 bg-background/40 hover:border-border',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60'
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <SeverityBadge severity={alert.severity} size="sm" />
                      <Badge variant="ghost" size="sm" className="font-mono uppercase">
                        {kinds[alert.kind] ?? alert.kind}
                      </Badge>
                      {alert.count > 1 && (
                        <Badge variant="secondary" size="sm" className="font-mono">
                          ×{alert.count}
                        </Badge>
                      )}
                      <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground">
                        {alert.timestamp.slice(11, 19)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm font-medium leading-snug">{alert.title}</p>
                    <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                      {alert.rule_id} · {alert.host} · {alert.user}
                    </p>
                    {isSelected && (
                      <p className="mt-1.5 flex items-center gap-1 text-[11px] text-primary">
                        <MousePointerClick className="size-3" aria-hidden="true" />
                        {lab.alerts.selected}
                      </p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
