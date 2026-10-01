'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useSite } from '@/i18n';
import { SeverityBadge } from './severity-badge';
import type { LabEvent } from './types';

export interface AlertRef {
  severity: string;
  rule_id: string;
}

export function EventQueue({
  events,
  alertByEventId,
}: {
  events: LabEvent[];
  alertByEventId: Map<string, AlertRef>;
}) {
  const site = useSite();
  const lab = site.pages.lab.stream;
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState('all');
  const [category, setCategory] = useState('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const event of events) set.add(event.category);
    return [...set].sort();
  }, [events]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return events.filter((event) => {
      if (category !== 'all' && event.category !== category) return false;
      if (severity !== 'all') {
        const alert = alertByEventId.get(event.id);
        const current = alert?.severity ?? 'informational';
        if (current !== severity) return false;
      }
      if (needle) {
        const haystack = [
          event.id,
          event.host,
          event.user,
          event.process,
          event.command_line,
          event.ip,
          event.action,
          event.text,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [events, alertByEventId, query, severity, category]);

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [events.length, autoScroll]);

  const severityOptions = ['informational', 'low', 'medium', 'high', 'critical'];
  const severityLabels = site.pages.lab.severity as unknown as Record<string, string>;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CardTitle>{lab.title}</CardTitle>
            <Badge variant="outline" className="font-mono text-xs">
              {events.length} {events.length === 1 ? lab.eventOne : lab.eventsCount}
            </Badge>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="size-3.5 rounded border-border"
            />
            {lab.autoScroll}
          </label>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              placeholder={lab.search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 text-xs"
              aria-label={lab.searchAria}
            />
          </div>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            aria-label={lab.filterSeverity}
            className="h-9 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="all">{lab.severityAll}</option>
            {severityOptions.map((value) => (
              <option key={value} value={value}>
                {severityLabels[value] ?? value}
              </option>
            ))}
          </select>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label={lab.filterCategory}
            className="h-9 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="all">{lab.categoryAll}</option>
            {categories.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <div
          className="h-[520px] overflow-y-auto rounded-lg border border-border/60 bg-background/40 p-2"
          role="log"
          aria-live="polite"
          aria-label={lab.title}
        >
          {events.length === 0 ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
              {lab.emptyIdle}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
              {lab.empty}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {filtered.map((event) => {
                const alert = alertByEventId.get(event.id);
                return (
                  <li
                    key={event.id}
                    className={cn(
                      'rounded-md border px-2.5 py-1.5 font-mono text-xs',
                      alert
                        ? 'border-primary/50 bg-primary/5'
                        : 'border-transparent hover:border-border/60 hover:bg-muted/40'
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="tabular-nums text-muted-foreground">
                        {event.timestamp.slice(11, 19)}
                      </span>
                      <Badge variant="ghost" size="sm" className="font-mono">
                        {event.category}
                      </Badge>
                      <span className="text-foreground">{event.action}</span>
                      <span className="text-muted-foreground">{event.host}</span>
                      <span className="text-muted-foreground">{event.user}</span>
                      {event.ip !== '-' && <span className="text-muted-foreground">{event.ip}</span>}
                      {alert && (
                        <span className="ml-auto flex items-center gap-1.5">
                          <SeverityBadge severity={alert.severity} size="sm" />
                          <Badge variant="destructive" size="sm" className="gap-1 font-mono">
                            <AlertTriangle className="size-3" aria-hidden="true" />
                            {lab.alert}
                          </Badge>
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-muted-foreground" title={event.command_line}>
                      {event.command_line !== '-' ? event.command_line : event.process}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
          <div ref={bottomRef} />
        </div>
      </CardContent>
    </Card>
  );
}
