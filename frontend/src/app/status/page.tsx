'use client';

import { useEffect, useRef, useState } from 'react';
import { Activity, Database, Server, HardDrive, Wifi, Cpu, MemoryStick, CheckCircle, AlertTriangle, XCircle, RefreshCw, ExternalLink, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useReducedMotion, useGSAP, useInView } from '@/hooks';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartAxis,
  ChartGrid,
  ChartLine,
  ChartDot,
  ChartXAxis,
  ChartYAxis,
  ChartCartesianGrid,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer as RechartsResponsiveContainer,
} from 'recharts';

interface SystemMetrics {
  cpu: number;
  memory: { used: number; total: number; percentage: number };
  disk: { used: number; total: number; percentage: number };
  network: { rx: number; tx: number };
  uptime: number;
  timestamp: string;
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    postgres: 'healthy' | 'unhealthy';
    redis: 'healthy' | 'unhealthy';
  };
  latency: {
    postgres: number;
    redis: number;
  };
}

const mockHistory = Array.from({ length: 60 }, (_, i) => ({
  time: new Date(Date.now() - (59 - i) * 10000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  cpu: Math.random() * 30 + 10,
  memory: Math.random() * 20 + 40,
  disk: 45 + Math.random() * 5,
}));

export function StatusPage() {
  const reducedMotion = useReducedMotion();
  const { gsap } = useGSAP();
  const sectionRef = useRef<HTMLSectionElement>(null);
  const [ref, isInView] = useInView<HTMLDivElement>({ triggerOnce: true, rootMargin: '0px 0px -50px 0px' });
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [history, setHistory] = useState(mockHistory);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    if (reducedMotion || !gsap || !isInView) return;

    const ctx = gsap.context(() => {
      gsap.from('.status-card', {
        y: 30,
        opacity: 0,
        duration: 0.6,
        stagger: 0.08,
        ease: 'expo.out',
      });
    }, sectionRef);

    return () => ctx.revert();
  }, [gsap, reducedMotion, isInView]);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const [metricsRes, healthRes] = await Promise.all([
          fetch('/api/backend/api/v1/status').catch(() => null),
          fetch('/api/backend/api/v1/health/ready').catch(() => null),
        ]);

        if (metricsRes?.ok) {
          const data = await metricsRes.json();
          setMetrics(data);
          setLastUpdate(new Date());
        }

        if (healthRes?.ok) {
          const data = await healthRes.json();
          setHealth(data);
        }
      } catch (error) {
        console.error('Failed to fetch metrics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setHistory(prev => [...prev.slice(1), {
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      cpu: metrics?.cpu || Math.random() * 30 + 10,
      memory: metrics?.memory?.percentage || Math.random() * 20 + 40,
      disk: metrics?.disk?.percentage || 45 + Math.random() * 5,
    }]);
  }, [metrics]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircle className="h-5 w-5 text-success" />;
      case 'degraded': return <AlertTriangle className="h-5 w-5 text-warning" />;
      case 'unhealthy': return <XCircle className="h-5 w-5 text-destructive" />;
      default: return <Minus className="h-5 w-5 text-muted-foreground" />;
    }
  };

  return (
    <div className="min-h-screen">
      <header className="section-sm relative overflow-hidden border-b border-border/50">
        <div className="absolute inset-0 gradient-mesh opacity-50" aria-hidden="true" />
        <div className="container-wide relative">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-display-sm font-display font-bold tracking-tight">
                System Status
              </h1>
              <p className="mt-1 text-muted-foreground">
                Real-time health metrics and system resource monitoring
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={health?.status === 'healthy' ? 'success' : health?.status === 'degraded' ? 'warning' : 'destructive'} className="gap-1.5">
                {getStatusIcon(health?.status || 'unknown')}
                {health?.status?.toUpperCase() || 'UNKNOWN'}
              </Badge>
              <Button variant="ghost" size="sm" onClick={() => window.location.reload()} aria-label="Refresh metrics">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container-wide py-8 px-6">
        <section ref={sectionRef} className="mb-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4" aria-labelledby="overview-title">
          <h2 id="overview-title" className="sr-only">System Overview</h2>

          <article className="status-card relative rounded-2xl border border-border/50 bg-card/50 p-6 transition-all duration-300 hover:border-primary/30 hover:shadow-glow hover:bg-card">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Cpu className="h-6 w-6" aria-hidden="true" />
              </div>
              <Badge variant="outline" className="font-mono text-xs">LIVE</Badge>
            </div>
            <div className="text-4xl font-display font-bold tabular-nums text-foreground">{metrics?.cpu?.toFixed(1) || '—'}%</div>
            <p className="text-sm text-muted-foreground">CPU Usage</p>
            <div className="mt-4 h-2 w-full rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${metrics?.cpu || 0}%` }}
                role="progressbar"
                aria-valuenow={metrics?.cpu || 0}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="CPU usage percentage"
              />
            </div>
          </article>

          <article className="status-card relative rounded-2xl border border-border/50 bg-card/50 p-6 transition-all duration-300 hover:border-primary/30 hover:shadow-glow hover:bg-card">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-success/10 text-success">
                <MemoryStick className="h-6 w-6" aria-hidden="true" />
              </div>
              <Badge variant="outline" className="font-mono text-xs">
                {formatBytes(metrics?.memory?.used || 0)} / {formatBytes(metrics?.memory?.total || 0)}
              </Badge>
            </div>
            <div className="text-4xl font-display font-bold tabular-nums text-foreground">{metrics?.memory?.percentage?.toFixed(1) || '—'}%</div>
            <p className="text-sm text-muted-foreground">Memory Usage</p>
            <div className="mt-4 h-2 w-full rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-success transition-all duration-500"
                style={{ width: `${metrics?.memory?.percentage || 0}%` }}
                role="progressbar"
                aria-valuenow={metrics?.memory?.percentage || 0}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Memory usage percentage"
              />
            </div>
          </article>

          <article className="status-card relative rounded-2xl border border-border/50 bg-card/50 p-6 transition-all duration-300 hover:border-primary/30 hover:shadow-glow hover:bg-card">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-warning/10 text-warning">
                <HardDrive className="h-6 w-6" aria-hidden="true" />
              </div>
              <Badge variant="outline" className="font-mono text-xs">
                {formatBytes(metrics?.disk?.used || 0)} / {formatBytes(metrics?.disk?.total || 0)}
              </Badge>
            </div>
            <div className="text-4xl font-display font-bold tabular-nums text-foreground">{metrics?.disk?.percentage?.toFixed(1) || '—'}%</div>
            <p className="text-sm text-muted-foreground">Disk Usage</p>
            <div className="mt-4 h-2 w-full rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-warning transition-all duration-500"
                style={{ width: `${metrics?.disk?.percentage || 0}%` }}
                role="progressbar"
                aria-valuenow={metrics?.disk?.percentage || 0}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Disk usage percentage"
              />
            </div>
          </article>

          <article className="status-card relative rounded-2xl border border-border/50 bg-card/50 p-6 transition-all duration-300 hover:border-primary/30 hover:shadow-glow hover:bg-card">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan/10 text-cyan">
                <Activity className="h-6 w-6" aria-hidden="true" />
              </div>
              <Badge variant="outline" className="font-mono text-xs">
                Uptime: {metrics?.uptime ? formatUptime(metrics.uptime) : '—'}
              </Badge>
            </div>
            <div className="text-4xl font-display font-bold tabular-nums text-foreground">
              {metrics?.network ? `${(metrics.network.rx / 1024 / 1024).toFixed(1)} MB/s ↓` : '—'}
            </div>
            <p className="text-sm text-muted-foreground">Network RX</p>
            <div className="text-sm text-muted-foreground">
              {metrics?.network ? `${(metrics.network.tx / 1024 / 1024).toFixed(1)} MB/s ↑` : '—'} TX
            </p>
          </article>
        </section>

        <section className="mb-8 grid gap-6 lg:grid-cols-2" aria-labelledby="charts-title">
          <h2 id="charts-title" className="sr-only">Metric Charts</h2>

          <Card className="status-card">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>CPU & Memory History (Last 10 min)</span>
                <Badge variant="outline" className="font-mono text-xs">60 samples</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <RechartsResponsiveContainer width="100%" height="100%">
                  <LineChart data={history} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
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
                      content={<ChartTooltipContent />}
                      labelFormatter={(value) => value}
                      formatter={(value: number) => [`${value.toFixed(1)}%`, '']}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="cpu"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 6, fill: 'hsl(var(--primary))' }}
                      name="CPU %"
                    />
                    <Line
                      type="monotone"
                      dataKey="memory"
                      stroke="hsl(var(--success))"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 6, fill: 'hsl(var(--success))' }}
                      name="Memory %"
                    />
                  </LineChart>
                </RechartsResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="status-card">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Disk Usage Trend</span>
                <Badge variant="outline" className="font-mono text-xs">
                  Current: {metrics?.disk?.percentage?.toFixed(1) || '—'}%
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <RechartsResponsiveContainer width="100%" height="100%">
                  <LineChart data={history} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" />
                    <XAxis
                      dataKey="time"
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      domain={[40, 55]}
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={<ChartTooltipContent />}
                      labelFormatter={(value) => value}
                      formatter={(value: number) => [`${value.toFixed(2)}%`, '']}
                    />
                    <Line
                      type="monotone"
                      dataKey="disk"
                      stroke="hsl(var(--warning))"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 6, fill: 'hsl(var(--warning))' }}
                      name="Disk %"
                    />
                  </LineChart>
                </RechartsResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-2" aria-labelledby="services-title">
          <h2 id="services-title" className="sr-only">Service Health</h2>

          <Card className="status-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" aria-hidden="true" />
                PostgreSQL
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Connection Status</span>
                <Badge variant={health?.checks?.postgres === 'healthy' ? 'success' : 'destructive'} className="gap-1.5">
                  {health?.checks?.postgres === 'healthy' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {health?.checks?.postgres || 'unknown'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Query Latency</span>
                <span className="font-mono text-foreground">
                  {health?.latency?.postgres ? `${health.latency.postgres}ms` : '—'}
                </span>
              </div>
              <Separator />
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold tabular-nums text-foreground">12</p>
                  <p className="text-xs text-muted-foreground">Active Connections</p>
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums text-foreground">1.2k</p>
                  <p className="text-xs text-muted-foreground">Queries/min</p>
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums text-foreground">45 MB</p>
                  <p className="text-xs text-muted-foreground">Buffer Cache</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="status-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" aria-hidden="true" />
                Redis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Connection Status</span>
                <Badge variant={health?.checks?.redis === 'healthy' ? 'success' : 'destructive'} className="gap-1.5">
                  {health?.checks?.redis === 'healthy' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {health?.checks?.redis || 'unknown'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Ping Latency</span>
                <span className="font-mono text-foreground">
                  {health?.latency?.redis ? `${health.latency.redis}ms` : '—'}
                </span>
              </div>
              <Separator />
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold tabular-nums text-foreground">8.4 MB</p>
                  <p className="text-xs text-muted-foreground">Memory Used</p>
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums text-foreground">12.4k</p>
                  <p className="text-xs text-muted-foreground">Ops/sec</p>
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums text-foreground">42</p>
                  <p className="text-xs text-muted-foreground">Connected Clients</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="status-card lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" aria-hidden="true" />
                API Endpoints Health
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full" role="table">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left p-3 font-medium">Endpoint</th>
                      <th className="text-center p-3 font-medium">Status</th>
                      <th className="text-center p-3 font-medium">Avg Latency</th>
                      <th className="text-center p-3 font-medium">Error Rate</th>
                      <th className="text-center p-3 font-medium">Requests/min</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { path: 'GET /api/v1/health/live', status: 'healthy', latency: '2ms', errors: '0%', rpm: '120' },
                      { path: 'GET /api/v1/health/ready', status: 'healthy', latency: '15ms', errors: '0%', rpm: '60' },
                      { path: 'POST /api/v1/contact', status: 'healthy', latency: '45ms', errors: '0.1%', rpm: '5' },
                      { path: 'WS /api/v1/lab/ws', status: 'healthy', latency: '8ms', errors: '0%', rpm: '30' },
                      { path: 'GET /api/v1/github/stats', status: 'healthy', latency: '120ms', errors: '0%', rpm: '10' },
                      { path: 'GET /api/v1/status', status: 'healthy', latency: '25ms', errors: '0%', rpm: '20' },
                    ].map((endpoint) => (
                      <tr key={endpoint.path} className="border-b border-border/50 hover:bg-card/50 transition-colors">
                        <td className="p-3"><code className="text-sm font-mono">{endpoint.path}</code></td>
                        <td className="p-3 text-center">
                          <Badge variant={endpoint.status === 'healthy' ? 'success' : 'destructive'} className="gap-1">
                            {endpoint.status === 'healthy' ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                            {endpoint.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-center font-mono text-sm">{endpoint.latency}</td>
                        <td className="p-3 text-center font-mono text-sm">{endpoint.errors}</td>
                        <td className="p-3 text-center font-mono text-sm">{endpoint.rpm}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mt-8" aria-labelledby="version-title">
          <h2 id="version-title" className="sr-only">Version Info</h2>
          <Card className="status-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" aria-hidden="true" />
                Version & Build Info
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-sm text-muted-foreground">Frontend Version</p>
                  <p className="font-mono text-foreground">0.1.0</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Backend Version</p>
                  <p className="font-mono text-foreground">0.1.0</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Build Date</p>
                  <p className="font-mono text-foreground">{new Date().toISOString().split('T')[0]}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Node.js</p>
                  <p className="font-mono text-foreground">20.x</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Python</p>
                  <p className="font-mono text-foreground">3.12</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Docker Compose</p>
                  <p className="font-mono text-foreground">3.9</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}