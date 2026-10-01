'use client';

import { Check, PlayCircle, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useSite } from '@/i18n';
import { SeverityBadge } from './severity-badge';
import type { LabScenario } from './types';

type ScenarioMeta = { title: string; description: string };

export function ScenarioPicker({
  scenarios,
  selectedId,
  runningId,
  disabled,
  onSelect,
  onStart,
}: {
  scenarios: LabScenario[];
  selectedId: string | null;
  runningId: string | null;
  disabled: boolean;
  onSelect: (id: string) => void;
  onStart: (id: string) => void;
}) {
  const site = useSite();
  const lab = site.pages.lab.scenarios;
  const metas = lab as unknown as Record<string, ScenarioMeta | undefined>;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{lab.title}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{lab.subtitle}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {scenarios.map((scenario) => {
            const meta = metas[scenario.id];
            const isSelected = selectedId === scenario.id;
            const isRunning = runningId === scenario.id;
            return (
              <button
                key={scenario.id}
                type="button"
                aria-pressed={isSelected}
                disabled={disabled && !isRunning}
                onClick={() => onSelect(scenario.id)}
                className={cn(
                  'group flex h-full flex-col gap-2 rounded-lg border p-3 text-left transition-colors',
                  isSelected
                    ? 'border-primary/60 bg-primary/5 ring-1 ring-primary/40'
                    : 'border-border/60 bg-background/50 hover:border-border',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-60'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium leading-snug">
                    {meta?.title ?? scenario.name}
                  </span>
                  {isSelected ? (
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  ) : isRunning ? (
                    <PlayCircle className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                  ) : null}
                </div>
                <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                  {meta?.description ?? scenario.description}
                </p>
                <div className="mt-auto flex flex-wrap items-center gap-1.5">
                  <Badge variant="ghost" size="sm" className="font-mono">
                    {scenario.event_count} {scenario.event_count === 1 ? lab.eventOne : lab.events}
                  </Badge>
                  <SeverityBadge severity={scenario.severity} size="sm" />
                  {scenario.mitre.slice(0, 2).map((technique) => (
                    <Badge key={technique} variant="outline" size="sm" className="font-mono">
                      {technique}
                    </Badge>
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldAlert className="size-4 shrink-0 text-primary" aria-hidden="true" />
            {lab.expectedRules}: {(scenarios.find((s) => s.id === selectedId)?.expected_rules ?? []).join(', ') || '—'}
          </p>
          <Button
            type="button"
            size="sm"
            disabled={!selectedId || disabled}
            onClick={() => selectedId && onStart(selectedId)}
          >
            <PlayCircle className="mr-1.5 size-4" aria-hidden="true" />
            {lab.run}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
