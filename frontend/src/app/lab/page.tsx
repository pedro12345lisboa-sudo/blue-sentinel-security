'use client';

import { useEffect, useRef, useState } from 'react';
import { Terminal, Play, Pause, RotateCcw, Zap, Shield, Activity, AlertTriangle, Search, Download, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useReducedMotion, useGSAP, useInView } from '@/hooks';
import { site } from '../../../content/site';

const lab = site.pages.lab;

const eventTypes = lab.demo.types;
const severities = lab.demo.severities;

const seedEvents = lab.demo.seed.map((event, index) => ({
  ...event,
  timestamp: Date.now() - 1000 * 60 * (lab.demo.seed.length - 1 - index),
}));

const initialRules = lab.rules.items.map((rule, index) => ({ id: index + 1, ...rule }));

function LabPage() {
  const reducedMotion = useReducedMotion();
  const { gsap } = useGSAP();
  const sectionRef = useRef<HTMLElement>(null);
  const [, isInView] = useInView<HTMLDivElement>({ triggerOnce: true, rootMargin: '0px 0px -50px 0px' });
  const eventsEndRef = useRef<HTMLDivElement>(null);

  const [events, setEvents] = useState(seedEvents);
  const [rules] = useState(initialRules);
  const [isRunning, setIsRunning] = useState(true);
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [eventId, setEventId] = useState(7);
  const [stats, setStats] = useState({ total: 0, alerts: 0, critical: 0, high: 0 });

  useEffect(() => {
    if (reducedMotion || !gsap || !isInView) return;

    const ctx = gsap.context(() => {
      gsap.from('.lab-card', {
        y: 30,
        opacity: 0,
        duration: 0.6,
        stagger: 0.1,
        ease: 'expo.out',
      });
    }, sectionRef);

    return () => ctx.revert();
  }, [gsap, reducedMotion, isInView]);

  useEffect(() => {
    const total = events.length;
    const alerts = events.filter(e => e.alert).length;
    const critical = events.filter(e => e.severity === 'critical').length;
    const high = events.filter(e => e.severity === 'high').length;
    setStats({ total, alerts, critical, high });
  }, [events]);

  useEffect(() => {
    if (!isRunning || reducedMotion) return;
    const interval = setInterval(() => {
      const rule = rules[Math.floor(Math.random() * rules.length)];
      const newEvent = {
        id: eventId,
        type: eventTypes[Math.floor(Math.random() * eventTypes.length)],
        name: lab.demo.names[Math.floor(Math.random() * lab.demo.names.length)],
        detail: lab.demo.details[Math.floor(Math.random() * lab.demo.details.length)],
        severity: severities[Math.floor(Math.random() * severities.length)],
        mitre: rule.mitre,
        timestamp: Date.now(),
        alert: Math.random() > 0.6,
      };
      setEvents(prev => [newEvent, ...prev.slice(0, 99)]);
      setEventId(prev => prev + 1);
    }, 3000);
    return () => clearInterval(interval);
  }, [isRunning, reducedMotion, eventId, rules]);

  const filteredEvents = events.filter(e => {
    if (selectedSeverity !== 'all' && e.severity !== selectedSeverity) return false;
    if (selectedType !== 'all' && e.type !== selectedType) return false;
    if (searchQuery && !e.name.toLowerCase().includes(searchQuery.toLowerCase()) && !e.detail.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const matchesFor = (mitre: string) => events.filter(e => e.mitre === mitre).length;

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-destructive border-destructive/30 bg-destructive/10';
      case 'high': return 'text-warning border-warning/30 bg-warning/10';
      case 'medium': return 'text-primary border-primary/30 bg-primary/10';
      case 'low': return 'text-success border-success/30 bg-success/10';
      default: return 'text-muted-foreground';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'process': return <Terminal className="h-4 w-4" />;
      case 'network': return <Activity className="h-4 w-4" />;
      case 'file': return <Shield className="h-4 w-4" />;
      case 'registry': return <Zap className="h-4 w-4" />;
      case 'dns': return <Search className="h-4 w-4" />;
      case 'auth': return <Shield className="h-4 w-4" />;
      default: return <Terminal className="h-4 w-4" />;
    }
  };

  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth' });
  }, [events, reducedMotion]);

  return (
    <div className="min-h-screen">
      <header className="section-sm relative overflow-hidden border-b border-border/50">
        <div className="absolute inset-0 gradient-mesh opacity-50" aria-hidden="true" />
        <div className="container-wide relative">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-display-sm font-display font-bold tracking-tight">
                <span className="font-mono text-primary">{lab.titleAccent}</span> {lab.title}
              </h1>
              <p className="mt-1 text-muted-foreground">
                {lab.description}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={isRunning ? 'success' : 'secondary'} className="gap-1.5">
                <span className={cn('h-2 w-2 rounded-full', isRunning ? 'bg-success animate-pulse' : 'bg-muted-foreground')} />
                {isRunning ? lab.status.live : lab.status.paused}
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

      <div className="container-wide py-8 px-6">
        <div className="grid gap-6 lg:grid-cols-12">
          <section ref={sectionRef} className="lab-card lg:col-span-8" aria-labelledby="events-title">
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <h2 id="events-title" className="text-lg font-semibold">{lab.stream.title}</h2>
                <Badge variant="outline" className="font-mono text-xs">
                  {events.length} {events.length === 1 ? lab.stream.eventOne : lab.stream.eventsCount}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setIsRunning(!isRunning)} aria-label={isRunning ? lab.stream.ariaPause : lab.stream.ariaResume}>
                  {isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setEvents([]); setEventId(1); }} aria-label={lab.stream.ariaClear} title={lab.stream.clearHint}>
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" aria-label={lab.stream.ariaExport}>
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-2 sm:gap-4">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  type="search"
                  placeholder={lab.stream.search}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  aria-label={lab.stream.searchAria}
                />
              </div>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="w-[180px]" aria-label={lab.stream.filterType}>
                  <SelectValue placeholder={lab.stream.typeAll} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{lab.stream.typeAll}</SelectItem>
                  {eventTypes.map((t) => (
                    <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedSeverity} onValueChange={setSelectedSeverity}>
                <SelectTrigger className="w-[160px]" aria-label={lab.stream.filterSeverity}>
                  <SelectValue placeholder={lab.stream.severityAll} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{lab.stream.severityAll}</SelectItem>
                  {severities.map((s) => (
                    <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="h-[500px] overflow-y-auto scrollbar-hide border border-border/50 rounded-lg bg-background/50" role="log" aria-live="polite" aria-label={lab.stream.title}>
              {filteredEvents.length === 0 ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <p>{lab.stream.empty}</p>
                </div>
              ) : (
                <div className="p-3 space-y-2" ref={eventsEndRef}>
                  {filteredEvents.map((event) => (
                    <div
                      key={event.id}
                      className={cn(
                        'flex items-start gap-3 p-3 rounded-lg border transition-all duration-300',
                        event.alert ? 'border-primary/50 bg-primary/5 shadow-glow' : 'border-border/50 hover:border-border/30'
                      )}
                      role="listitem"
                    >
                      <div className="flex-shrink-0 mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        {getTypeIcon(event.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-mono text-foreground">{event.name}</code>
                          <Badge className={cn(getSeverityColor(event.severity), 'text-xs')}>
                            {event.severity.toUpperCase()}
                          </Badge>
                          <Badge variant="ghost" className="text-xs font-mono">
                            {event.mitre}
                          </Badge>
                          {event.alert && (
                            <Badge variant="destructive" className="text-xs gap-1">
                              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                              {lab.stream.alert}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{event.detail}</p>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground/70">
                          <span>{new Date(event.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                          <span className="px-2 py-0.5 bg-muted rounded text-muted-foreground">{event.type}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <aside className="lg:col-span-4 space-y-6">
            <Card className="lab-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" aria-hidden="true" />
                  {lab.stats.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <p className="text-2xl font-bold tabular-nums text-primary">{stats.total}</p>
                    <p className="text-xs text-muted-foreground">{lab.stats.total}</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                    <p className="text-2xl font-bold tabular-nums text-destructive">{stats.alerts}</p>
                    <p className="text-xs text-muted-foreground">{lab.stats.alerts}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 rounded-lg bg-warning/5 border border-warning/20">
                    <p className="text-2xl font-bold tabular-nums text-warning">{stats.critical}</p>
                    <p className="text-xs text-muted-foreground">{lab.stats.critical}</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <p className="text-2xl font-bold tabular-nums text-primary">{stats.high}</p>
                    <p className="text-xs text-muted-foreground">{lab.stats.high}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="lab-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" aria-hidden="true" />
                    {lab.rules.title}
                  </CardTitle>
                  <Badge variant="outline" className="font-mono text-xs">
                    {rules.filter(r => r.status === 'active').length} {lab.rules.activeCount}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[400px] overflow-y-auto scrollbar-hide">
                  {rules.map((rule) => (
                    <div
                      key={rule.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/50"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{rule.name}</p>
                        <p className="text-xs font-mono text-muted-foreground">{rule.mitre}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={rule.status === 'active' ? 'success' : 'ghost'}
                          className="text-xs"
                        >
                          {rule.status === 'active' ? lab.rules.active : lab.rules.inactive}
                        </Badge>
                        <span className="text-xs text-muted-foreground font-mono">{matchesFor(rule.mitre)} {lab.rules.matches}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="lab-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" aria-hidden="true" />
                  {lab.config.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="label-base">{lab.config.rate}</label>
                  <select className="input-base" defaultValue="3000">
                    {lab.config.rateOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label-base">{lab.config.buffer}</label>
                  <select className="input-base" defaultValue="100">
                    {lab.config.bufferOptions.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="auto-scroll" defaultChecked className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
                  <label htmlFor="auto-scroll" className="text-sm font-medium">{lab.config.autoScroll}</label>
                </div>
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="sound-alerts" className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
                  <label htmlFor="sound-alerts" className="text-sm font-medium">{lab.config.sound}</label>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default LabPage;
