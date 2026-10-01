'use client';

import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  Activity,
  Database,
  Server,
  HardDrive,
  Cpu,
  MemoryStick,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Minus,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useReducedMotion } from '@/hooks';
import { site } from '../../../content/site';

const page = site.pages.status;
const lastUpdatedLabel = site.microcopy.misc.lastUpdated;

const API = '/api/backend/api/v1';
const POLL_MS = 10_000;
const HISTORY_LIMIT = 60;

interface SystemMetrics {
  cpu: number;
  memory?: { used: number; total: number; percentage: number };
  disk?: { used: number; total: number; percentage: number };
  network?: { rx: number; tx: number };
  uptime?: number;
}

interface HealthPayload {
  status?: string;
  checks?: Record<string, string>;
  latency?: Record<string, number>;
}

interface Sample {
  time: string;
  cpu: number;
  memory: number;
  disk: number;
}

type Level = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

const OK_VALUES = ['healthy', 'ok', 'up', 'ready', 'alive'];
const isOk = (value?: string) => !!value && OK_VALUES.includes(value.toLowerCase());

function getLevel(health: HealthPayload | null): Level {
  if (!health) return 'unknown';
  const status = health.status?.toLowerCase();
  const checks = Object.values(health.checks ?? {});
  if (!status && checks.length === 0) return 'unknown';
  if (status === 'degraded') return 'degraded';
  if (status && !isOk(status)) return 'unhealthy';
  const failing = checks.filter((c) => !isOk(c)).length;
  if (failing > 0) return failing === checks.length ? 'unhealthy' : 'degraded';
  return 'healthy';
}

const LEVEL_UI: Record<
  Level,
  { label: string; variant: 'success' | 'destructive' | 'outline'; className: string; icon: ReactNode }
> = {
  healthy: {
    label: page.levels.HEALTHY,
    variant: 'success',
    className: '',
    icon: <CheckCircle className="h-4 w-4" aria-hidden="true" />,
  },
  degraded: {
    label: page.levels.DEGRADED,
    variant: 'outline',
    className: 'border-warning text-warning',
    icon: <AlertTriangle className="h-4 w-4" aria-hidden="true" />,
  },
  unhealthy: {
    label: page.levels.UNHEALTHY,
    variant: 'destructive',
    className: '',
    icon: <XCircle className="h-4 w-4" aria-hidden="true" />,
  },
  unknown: {
    label: page.levels.UNKNOWN,
    variant: 'outline',
    className: '',
    icon: <Minus className="h-4 w-4" aria-hidden="true" />,
  },
};

const clampPct = (value?: number) =>
  Math.min(100, Math.max(0, typeof value === 'number' && Number.isFinite(value) ? value : 0));

const fmtPct = (value?: number) =>
  typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}%` : '—';

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${units[i]}`;
}

function formatUptime(seconds?: number) {
  if (!seconds || seconds < 0) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

interface MetricCardProps {
  icon: ReactNode;
  iconClass: string;
  label: string;
  value: string;
  pct?: number;
  barClass: string;
  badge?: string;
  footer?: string;
  className: string;
  style?: CSSProperties;
}

function MetricCard({
  icon,
  iconClass,
  label,
  value,
  pct,
  barClass,
  badge,
  footer,
  className,
  style,
}: MetricCardProps) {
  const width = clampPct(pct);
  return (
    <article
      className={`rounded-2xl border border-border/50 bg-card/50 p-6 transition-all duration-500 hover:border-primary/30 hover:bg-card ${className}`}
      style={style}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${iconClass}`}>
          {icon}
        </div>
        {badge && (
          <Badge variant="outline" className="font-mono text-xs">
            {badge}
          </Badge>
        )}
      </div>
      <div className="font-display text-4xl font-bold tabular-nums text-foreground">{value}</div>
      <p className="text-sm text-muted-foreground">{label}</p>
      {pct !== undefined ? (
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barClass}`}
            style={{ width: `${width}%` }}
            role="progressbar"
            aria-valuenow={Math.round(width)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={label}
          />
        </div>
      ) : (
        footer && <p className="mt-4 text-sm text-muted-foreground">{footer}</p>
      )}
    </article>
  );
}

interface SeriesDef {
  key: 'cpu' | 'memory' | 'disk';
  name: string;
  color: string;
}

function HistoryChart({
  data,
  series,
  emptyText,
}: {
  data: Sample[];
  series: SeriesDef[];
  emptyText: string;
}) {
  if (data.length < 2) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" />
          <XAxis
            dataKey="time"
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 8,
            }}
            formatter={(value) => `${Number(value).toFixed(1)}%`}
          />
          {series.length > 1 && <Legend />}
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

interface ServiceCardProps {
  icon: ReactNode;
  title: string;
  status?: string;
  latency?: number;
  className: string;
  style?: CSSProperties;
}

function ServiceCard({ icon, title, status, latency, className, style }: ServiceCardProps) {
  const known = status !== undefined;
  const ok = isOk(status);
  return (
    <Card className={`transition-all duration-500 ${className}`} style={style}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            {icon}
            {title}
          </span>
          {typeof latency === 'number' && (
            <Badge variant="outline" className="font-mono text-xs">
              {latency} ms
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {site.pages.security.columns.status}
          </span>
          <Badge variant={!known ? 'outline' : ok ? 'success' : 'destructive'} className="gap-1.5">
            {!known ? (
              <Minus className="h-4 w-4" aria-hidden="true" />
            ) : ok ? (
              <CheckCircle className="h-4 w-4" aria-hidden="true" />
            ) : (
              <XCircle className="h-4 w-4" aria-hidden="true" />
            )}
            {status ?? page.levels.UNKNOWN}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

const ENDPOINTS = [
  { method: 'GET', path: '/api/v1/health/live' },
  { method: 'GET', path: '/api/v1/health/ready' },
  { method: 'GET', path: '/api/v1/status' },
  { method: 'GET', path: '/api/v1/github/stats' },
  { method: 'POST', path: '/api/v1/contact' },
  { method: 'WS', path: '/ws/lab/{session_id}' },
];

export function StatusView() {
  const reducedMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [history, setHistory] = useState<Sample[]>([]);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [metricsRes, healthRes] = await Promise.all([
        fetch(`${API}/status`, { cache: 'no-store' }).catch(() => null),
        fetch(`${API}/health/ready`, { cache: 'no-store' }).catch(() => null),
      ]);

      let reachable = false;

      if (metricsRes?.ok) {
        const data = await metricsRes.json().catch(() => null);
        const m = (data?.metrics ?? data) as SystemMetrics | null;
        if (m && typeof m.cpu === 'number') {
          reachable = true;
          setMetrics(m);
          setLastUpdate(new Date());
          setHistory((prev) =>
            [
              ...prev,
              {
                time: new Date().toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                }),
                cpu: m.cpu,
                memory: m.memory?.percentage ?? 0,
                disk: m.disk?.percentage ?? 0,
              },
            ].slice(-HISTORY_LIMIT),
          );
        }
      }

      if (healthRes) {
        // /health/ready pode responder 503 com JSON útil, então lemos mesmo sem "ok".
        const data = await healthRes.json().catch(() => null);
        if (data && typeof data === 'object') {
          reachable = true;
          setHealth((data.health ?? data) as HealthPayload);
        }
      }

      setOffline(!reachable);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const level = getLevel(health);
  const levelUi = LEVEL_UI[level];
  const visible = mounted || reducedMotion;
  const revealClass = visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4';
  const delay = (i: number): CSSProperties | undefined =>
    reducedMotion ? undefined : { transitionDelay: `${i * 80}ms` };
  const chartEmptyText = loading ? page.loading : page.empty;

  return (
    <div className="min-h-screen">
      <header className="section-sm relative overflow-hidden border-b border-border/50">
        <div className="gradient-mesh absolute inset-0 opacity-50" aria-hidden="true" />
        <div className="container-wide relative">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="font-display text-display-sm font-bold tracking-tight">
                {page.title}
              </h1>
              <p className="mt-1 text-muted-foreground">
                {page.description}
                {lastUpdate &&
                  ` ${lastUpdatedLabel}: ${lastUpdate.toLocaleTimeString('pt-BR')}.`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={levelUi.variant} className={`gap-1.5 ${levelUi.className}`}>
                {levelUi.icon}
                {levelUi.label}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={load}
                disabled={refreshing}
                aria-label={page.refresh}
              >
                <RefreshCw
                  className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container-wide px-6 py-8">
        {!loading && offline && (
          <div
            role="status"
            className="mb-8 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm"
          >
            <p className="font-medium text-foreground">{page.error}</p>
            <p className="mt-1 text-muted-foreground">{page.offline}</p>
          </div>
        )}

        <section
          className="mb-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
          aria-labelledby="overview-title"
        >
          <h2 id="overview-title" className="sr-only">
            {page.overview}
          </h2>

          <MetricCard
            icon={<Cpu className="h-6 w-6" aria-hidden="true" />}
            iconClass="bg-primary/10 text-primary"
            label={page.gauges.cpu}
            value={fmtPct(metrics?.cpu)}
            pct={metrics ? metrics.cpu : 0}
            barClass="bg-primary"
            className={revealClass}
            style={delay(0)}
          />
          <MetricCard
            icon={<MemoryStick className="h-6 w-6" aria-hidden="true" />}
            iconClass="bg-success/10 text-success"
            label={page.gauges.memory}
            value={fmtPct(metrics?.memory?.percentage)}
            pct={metrics?.memory?.percentage ?? 0}
            barClass="bg-success"
            badge={
              metrics?.memory
                ? `${formatBytes(metrics.memory.used)} / ${formatBytes(metrics.memory.total)}`
                : undefined
            }
            className={revealClass}
            style={delay(1)}
          />
          <MetricCard
            icon={<HardDrive className="h-6 w-6" aria-hidden="true" />}
            iconClass="bg-warning/10 text-warning"
            label={page.gauges.disk}
            value={fmtPct(metrics?.disk?.percentage)}
            pct={metrics?.disk?.percentage ?? 0}
            barClass="bg-warning"
            badge={
              metrics?.disk
                ? `${formatBytes(metrics.disk.used)} / ${formatBytes(metrics.disk.total)}`
                : undefined
            }
            className={revealClass}
            style={delay(2)}
          />
          <MetricCard
            icon={<Activity className="h-6 w-6" aria-hidden="true" />}
            iconClass="bg-primary/10 text-primary"
            label={page.gauges.uptime}
            value={formatUptime(metrics?.uptime)}
            badge={
              metrics?.network
                ? `↓ ${(metrics.network.rx / 1024 / 1024).toFixed(1)} MB/s`
                : undefined
            }
            barClass=""
            footer={
              metrics?.network
                ? `↑ ${(metrics.network.tx / 1024 / 1024).toFixed(1)} MB/s`
                : page.empty
            }
            className={revealClass}
            style={delay(3)}
          />
        </section>

        <section className="mb-8 grid gap-6 lg:grid-cols-2" aria-labelledby="charts-title">
          <h2 id="charts-title" className="sr-only">
            {page.charts}
          </h2>

          <Card className={`transition-all duration-500 ${revealClass}`} style={delay(4)}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span>
                  {page.gauges.cpu} · {page.gauges.memory}
                </span>
                <Badge variant="outline" className="font-mono text-xs">
                  {history.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <HistoryChart
                data={history}
                emptyText={chartEmptyText}
                series={[
                  { key: 'cpu', name: page.gauges.cpu, color: 'hsl(var(--primary))' },
                  { key: 'memory', name: page.gauges.memory, color: 'hsl(var(--success))' },
                ]}
              />
            </CardContent>
          </Card>

          <Card className={`transition-all duration-500 ${revealClass}`} style={delay(5)}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span>{page.gauges.disk}</span>
                <Badge variant="outline" className="font-mono text-xs">
                  {fmtPct(metrics?.disk?.percentage)}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <HistoryChart
                data={history}
                emptyText={chartEmptyText}
                series={[{ key: 'disk', name: page.gauges.disk, color: 'hsl(var(--warning))' }]}
              />
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-2" aria-labelledby="services-title">
          <h2 id="services-title" className="sr-only">
            {page.services}
          </h2>

          <ServiceCard
            icon={<Database className="h-5 w-5" aria-hidden="true" />}
            title="PostgreSQL"
            status={health?.checks?.postgres}
            latency={health?.latency?.postgres}
            className={revealClass}
            style={delay(6)}
          />
          <ServiceCard
            icon={<Server className="h-5 w-5" aria-hidden="true" />}
            title="Redis"
            status={health?.checks?.redis}
            latency={health?.latency?.redis}
            className={revealClass}
            style={delay(7)}
          />

          <Card className={`transition-all duration-500 lg:col-span-2 ${revealClass}`} style={delay(8)}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" aria-hidden="true" />
                {page.services}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 text-left">
                      <th className="p-3 font-medium">{site.pages.projects.detail.type}</th>
                      <th className="p-3 font-medium">{page.services}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ENDPOINTS.map((endpoint) => (
                      <tr
                        key={`${endpoint.method}-${endpoint.path}`}
                        className="border-b border-border/50 transition-colors hover:bg-card/50"
                      >
                        <td className="p-3">
                          <Badge variant="outline" className="font-mono text-xs">
                            {endpoint.method}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <code className="font-mono">{endpoint.path}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
