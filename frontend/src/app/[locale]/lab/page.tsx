'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ShieldCheck, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useSite } from '@/i18n';
import { ScenarioPicker } from '@/components/lab/scenario-picker';
import { LabControls } from '@/components/lab/lab-controls';
import { EventQueue, type AlertRef } from '@/components/lab/event-queue';
import { AlertsPanel } from '@/components/lab/alerts-panel';
import { ExplanationPanel } from '@/components/lab/explanation-panel';
import { IncidentTimeline } from '@/components/lab/incident-timeline';
import { SeverityBadge } from '@/components/lab/severity-badge';
import { useLabSession } from '@/components/lab/use-lab-session';
import type { LabReport, LabRuleSummary } from '@/components/lab/types';

function StatsCard({ lab, values }: { lab: ReturnType<typeof useLabStatsSeed>; values: ReturnType<typeof computeStats> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="size-5" aria-hidden="true" />
          {lab.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          {values.map((item) => (
            <div key={item.label} className="rounded-lg border border-border/50 bg-background/50 p-3 text-center">
              <p className={cn('text-xl font-bold tabular-nums', item.tone)}>{item.display}</p>
              <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{item.label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function useLabStatsSeed() {
  const site = useSite();
  return site.pages.lab.stats;
}

function computeStats(lab: ReturnType<typeof useLabStatsSeed>, session: ReturnType<typeof useLabSession>) {
  const { alerts, events, report } = session;
  const critical = alerts.filter((alert) => alert.severity === 'critical').length;
  const high = alerts.filter((alert) => alert.severity === 'high').length;
  const correlation = report?.correlation_fires ?? alerts.filter((alert) => alert.kind === 'correlation').length;
  return [
    { label: lab.total, display: String(report?.events ?? events.length), tone: 'text-primary' },
    { label: lab.alerts, display: String(report?.alerts ?? alerts.length), tone: 'text-destructive' },
    { label: lab.critical, display: String(critical), tone: 'text-destructive' },
    { label: lab.high, display: String(high), tone: 'text-warning' },
    { label: lab.correlation, display: String(correlation), tone: 'text-primary' },
    { label: lab.suppressed, display: report ? String(report.suppressed) : '—', tone: 'text-muted-foreground' },
  ];
}

function RulesCard({ rules, errors }: { rules: LabRuleSummary[]; errors: string[] }) {
  const site = useSite();
  const lab = site.pages.lab;
  const counts = { sigma: 0, yara: 0, correlation: 0 };
  for (const rule of rules) counts[rule.kind] += 1;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5" aria-hidden="true" />
            {lab.rules.title}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" size="sm" className="font-mono">
              {lab.rules.sigma} {counts.sigma}
            </Badge>
            <Badge variant="outline" size="sm" className="font-mono">
              {lab.rules.yara} {counts.yara}
            </Badge>
            <Badge variant="outline" size="sm" className="font-mono">
              {lab.rules.correlation} {counts.correlation}
            </Badge>
            <Badge variant="secondary" size="sm" className="font-mono">
              {rules.length} {lab.rules.count}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">{lab.rules.empty}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {rules.map((rule) => (
              <li
                key={rule.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-background/50 p-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{rule.title}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">{rule.id}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge variant="ghost" size="sm" className="font-mono uppercase">
                    {rule.kind}
                  </Badge>
                  <SeverityBadge severity={rule.level} size="sm" />
                </div>
              </li>
            ))}
          </ul>
        )}
        {errors.length > 0 && (
          <ul className="space-y-1">
            {errors.map((error) => (
              <li key={error} className="break-all font-mono text-[11px] text-destructive">
                {error}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ReportCard({ report }: { report: LabReport }) {
  const site = useSite();
  const lab = site.pages.lab.report;
  const matched = report.final_severity === report.expected_severity;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
            {lab.title}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{report.scenario_id}</span>
            <Badge variant={matched ? 'success' : 'warning'} size="sm">
              {matched ? lab.matched : `${lab.expectedSeverity}: ${report.expected_severity}`}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border/50 bg-background/50 p-3 text-center">
            <p className="text-xl font-bold tabular-nums text-primary">{report.events}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{lab.events}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/50 p-3 text-center">
            <p className="text-xl font-bold tabular-nums text-destructive">{report.alerts}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{lab.alerts}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/50 p-3 text-center">
            <p className="text-xl font-bold tabular-nums text-warning">{report.suppressed}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{lab.suppressed}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/50 p-3 text-center">
            <p className="text-xl font-bold tabular-nums text-primary">{report.correlation_fires}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{lab.correlation}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          <p className="flex items-center gap-2">
            <span className="text-muted-foreground">{lab.finalSeverity}:</span>
            <SeverityBadge severity={report.final_severity} />
          </p>
          <p className="flex items-center gap-2">
            <span className="text-muted-foreground">{lab.expectedSeverity}:</span>
            <SeverityBadge severity={report.expected_severity} />
          </p>
          <p className="text-xs text-muted-foreground">
            {lab.engine}: <span className="font-mono">{report.yara_engine}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {lab.budget}: <span className="font-mono">{report.max_process_ms} ms</span>
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {lab.missing}
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {report.missing_rules.length === 0 ? (
                <Badge variant="success" size="sm">
                  {lab.none}
                </Badge>
              ) : (
                report.missing_rules.map((rule) => (
                  <Badge key={rule} variant="destructive" size="sm" className="font-mono">
                    {rule}
                  </Badge>
                ))
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {lab.unexpected}
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {report.unexpected_rules.length === 0 ? (
                <Badge variant="success" size="sm">
                  {lab.none}
                </Badge>
              ) : (
                report.unexpected_rules.map((rule) => (
                  <Badge key={rule} variant="warning" size="sm" className="font-mono">
                    {rule}
                  </Badge>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {lab.rulesFired}
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {report.rules_fired.map((rule) => (
              <Badge key={rule} variant="outline" size="sm" className="font-mono">
                {rule}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LabPage() {
  const site = useSite();
  const lab = site.pages.lab;
  const session = useLabSession();
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);

  useEffect(() => {
    // `?scenario=<id>` vem do botão "Ver no laboratório" dos playbooks.
    const wanted = new URLSearchParams(window.location.search).get('scenario');
    const valid =
      wanted && session.scenarios.some((scenario) => scenario.id === wanted) ? wanted : null;
    setSelectedScenario((prev) => prev ?? valid ?? session.scenarios[0]?.id ?? null);
  }, [session.scenarios]);

  useEffect(() => {
    if (session.alerts.length === 0) {
      setSelectedAlertId(null);
      return;
    }
    setSelectedAlertId((prev) =>
      prev && session.alerts.some((alert) => alert.id === prev) ? prev : session.alerts[session.alerts.length - 1].id
    );
  }, [session.alerts]);

  const alertByEventId = useMemo(() => {
    const map = new Map<string, AlertRef>();
    for (const alert of session.alerts) {
      if (!map.has(alert.event_id)) map.set(alert.event_id, { severity: alert.severity, rule_id: alert.rule_id });
    }
    return map;
  }, [session.alerts]);

  const selectedAlert = useMemo(
    () => session.alerts.find((alert) => alert.id === selectedAlertId) ?? null,
    [session.alerts, selectedAlertId]
  );
  const selectedEvent = useMemo(
    () => (selectedAlert ? session.events.find((event) => event.id === selectedAlert.event_id) ?? null : null),
    [session.events, selectedAlert]
  );

  const running = session.status === 'running' || session.status === 'paused';
  const statusLabel =
    session.connection === 'connecting'
      ? lab.status.connecting
      : session.status === 'running'
        ? lab.status.live
        : session.status === 'paused'
          ? lab.status.paused
          : session.status === 'completed'
            ? lab.status.completed
            : lab.status.idle;

  const statsLab = useLabStatsSeed();
  const stats = computeStats(statsLab, session);

  return (
    <div className="min-h-screen">
      <header className="section-sm relative overflow-hidden border-b border-border/50">
        <div className="gradient-mesh absolute inset-0 opacity-50" aria-hidden="true" />
        <div className="container-wide relative">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="font-display text-display-sm font-bold tracking-tight">
                <span className="font-mono text-primary">{lab.titleAccent}</span> {lab.title}
              </h1>
              <p className="mt-1 max-w-2xl text-muted-foreground">{lab.description}</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                variant="outline"
                className={cn(
                  'gap-1.5 uppercase',
                  session.status === 'running'
                    ? 'border-success/30 bg-success/10 text-success'
                    : session.status === 'paused'
                      ? 'border-warning/30 bg-warning/10 text-warning'
                      : session.connection === 'connected'
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'border-border bg-muted text-muted-foreground'
                )}
              >
                <span
                  className={cn(
                    'size-2 rounded-full',
                    session.status === 'running'
                      ? 'animate-pulse bg-success'
                      : session.connection === 'connected'
                        ? 'bg-primary'
                        : 'bg-muted-foreground'
                  )}
                  aria-hidden="true"
                />
                {statusLabel}
              </Badge>
            </div>
          </div>
        </div>
      </header>

      <div className="container-wide pt-6">
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
          <p className="font-medium text-foreground">{site.notices.lab.title}</p>
          <p className="mt-1 text-muted-foreground">{site.notices.lab.body}</p>
        </div>
      </div>

      <div className="container-wide space-y-6 px-6 py-8">
        {session.scenariosError && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {lab.connection.failed}
          </p>
        )}

        <ScenarioPicker
          scenarios={session.scenarios}
          selectedId={selectedScenario}
          runningId={session.runningScenario?.id ?? null}
          disabled={running}
          onSelect={setSelectedScenario}
          onStart={(id) => void session.start(id)}
        />

        <LabControls
          connection={session.connection}
          status={session.status}
          speed={session.speed}
          speedOptions={session.speedOptions}
          scenarioName={session.runningScenario?.name ?? null}
          notice={session.notice}
          errorCode={session.errorCode}
          canStart={Boolean(selectedScenario) && !running}
          canRestart={session.runningScenario !== null && session.status !== 'idle'}
          onStart={() => {
            if (selectedScenario) void session.start(selectedScenario);
          }}
          onRestart={session.restart}
          onPause={session.pause}
          onResume={session.resume}
          onSpeed={session.changeSpeed}
          onReload={session.reloadRules}
          onRetry={() => void session.retry()}
          onDismissError={session.clearError}
        />

        <div className="grid gap-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-7">
            <EventQueue events={session.events} alertByEventId={alertByEventId} />
            <ExplanationPanel
              alert={selectedAlert}
              event={selectedEvent}
              onClose={() => setSelectedAlertId(null)}
            />
          </div>
          <aside className="space-y-6 lg:col-span-5">
            <AlertsPanel
              alerts={session.alerts}
              selectedId={selectedAlertId}
              started={session.runningScenario !== null}
              onSelect={setSelectedAlertId}
            />
            <StatsCard lab={statsLab} values={stats} />
            <IncidentTimeline incident={session.incident} report={session.report} />
          </aside>
        </div>

        {session.report && <ReportCard report={session.report} />}

        <RulesCard rules={session.rules} errors={session.ruleErrors} />
      </div>
    </div>
  );
}

export default LabPage;
