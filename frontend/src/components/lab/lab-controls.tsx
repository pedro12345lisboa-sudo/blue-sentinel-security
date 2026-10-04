'use client';

import { AlertTriangle, Loader2, Pause, Play, PlugZap, RotateCcw, RefreshCw, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useSite } from '@/i18n';
import type { LabConnection, LabSessionStatus } from './types';

export function LabControls({
  connection,
  status,
  speed,
  speedOptions,
  scenarioName,
  notice,
  errorCode,
  canStart,
  canRestart,
  onStart,
  onRestart,
  onPause,
  onResume,
  onSpeed,
  onReload,
  onRetry,
  onDismissError,
}: {
  connection: LabConnection;
  status: LabSessionStatus;
  speed: number;
  speedOptions: number[];
  scenarioName: string | null;
  notice: string | null;
  errorCode: string | null;
  canStart: boolean;
  canRestart: boolean;
  onStart: () => void;
  onRestart: () => void;
  onPause: () => void;
  onResume: () => void;
  onSpeed: (value: number) => void;
  onReload: () => void;
  onRetry: () => void;
  onDismissError: () => void;
}) {
  const site = useSite();
  const lab = site.pages.lab;

  const statusLabel =
    connection === 'connecting'
      ? lab.status.connecting
      : status === 'running'
        ? lab.status.live
        : status === 'paused'
          ? lab.status.paused
          : status === 'completed'
            ? lab.status.completed
            : lab.status.idle;

  const statusTone =
    status === 'running'
      ? 'bg-success/10 text-success border-success/20'
      : status === 'paused'
        ? 'bg-warning/10 text-warning border-warning/20'
        : status === 'completed'
          ? 'bg-primary/10 text-primary border-primary/20'
          : 'bg-muted text-muted-foreground border-border';

  const errorText = errorCode
    ? ((lab.errors as Record<string, string | undefined>)[errorCode] ??
      (site.errors as Record<string, string | undefined>)[errorCode] ??
      site.errors.UNKNOWN)
    : null;
  const noticeText = notice ? (lab.controls as Record<string, string | undefined>)[notice] ?? null : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Zap className="size-5" aria-hidden="true" />
            {lab.controls.title}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn('gap-1.5 uppercase', statusTone)}>
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  status === 'running' ? 'animate-pulse bg-success' : 'bg-current'
                )}
                aria-hidden="true"
              />
              {statusLabel}
            </Badge>
            <Badge variant="ghost" size="sm" className="font-mono">
              {connection === 'connected'
                ? lab.connection.connected
                : connection === 'connecting'
                  ? lab.connection.connecting
                  : lab.connection.disconnected}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(status === 'idle' || status === 'completed') && (
            <Button type="button" size="sm" disabled={!canStart} onClick={onStart}>
              <Play className="mr-1.5 size-4" aria-hidden="true" />
              {lab.controls.start}
            </Button>
          )}
          {status === 'running' && (
            <Button type="button" size="sm" variant="outline" onClick={onPause}>
              <Pause className="mr-1.5 size-4" aria-hidden="true" />
              {lab.controls.pause}
            </Button>
          )}
          {status === 'paused' && (
            <Button type="button" size="sm" variant="outline" onClick={onResume}>
              <Play className="mr-1.5 size-4" aria-hidden="true" />
              {lab.controls.resume}
            </Button>
          )}
          {canRestart && (
            <Button type="button" size="sm" variant="outline" onClick={onRestart}>
              <RotateCcw className="mr-1.5 size-4" aria-hidden="true" />
              {lab.controls.restart}
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={onReload}>
            <RefreshCw className="mr-1.5 size-4" aria-hidden="true" />
            {lab.controls.reloadRules}
          </Button>

          <div className="ml-auto flex items-center gap-1.5" role="group" aria-label={lab.controls.speed}>
            <span className="text-xs text-muted-foreground">{lab.controls.speed}</span>
            {speedOptions.map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={speed === value ? 'default' : 'ghost'}
                className="h-7 min-w-9 px-2 font-mono text-xs"
                aria-pressed={speed === value}
                onClick={() => onSpeed(value)}
              >
                {value}x
              </Button>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {lab.controls.scenario}: <span className="font-mono text-foreground">{scenarioName ?? '—'}</span>
          {connection === 'error' && (
            <Button type="button" variant="link" size="sm" className="ml-2 h-auto p-0" onClick={onRetry}>
              <PlugZap className="mr-1 size-3.5" aria-hidden="true" />
              {lab.connection.retry}
            </Button>
          )}
        </p>

        {noticeText && (
          <p className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-xs text-success">
            {noticeText}
          </p>
        )}
        {errorText && (
          <p
            role="alert"
            className="flex items-start justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          >
            <span className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {errorText}
            </span>
            <button type="button" className="shrink-0 underline" onClick={onDismissError}>
              {lab.explain.close}
            </button>
          </p>
        )}
        {connection === 'connecting' && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            {lab.connection.connecting}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
