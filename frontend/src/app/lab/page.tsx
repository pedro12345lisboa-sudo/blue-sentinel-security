'use client';

import { useEffect, useRef, useState } from 'react';
import { Terminal, Play, Pause, RotateCcw, Zap, Shield, Activity, AlertTriangle, CheckCircle, XCircle, Search, Filter, Download, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useReducedMotion, useGSAP, useInView } from '@/hooks';

const eventTypes = ['process', 'network', 'file', 'registry', 'dns', 'auth'];
const severities = ['critical', 'high', 'medium', 'low'];
const mitreTactics = ['Initial Access', 'Execution', 'Persistence', 'Privilege Escalation', 'Defense Evasion', 'Credential Access', 'Discovery', 'Lateral Movement', 'Collection', 'Exfiltration', 'Command and Control'];

const mockEvents = [
  { id: 1, type: 'process', name: 'powershell.exe', detail: 'EncodedCommand execution detected', severity: 'high', mitre: 'T1059.001', timestamp: Date.now() - 1000 * 60 * 5, alert: true },
  { id: 2, type: 'network', name: 'svchost.exe', detail: 'Suspicious outbound connection to 192.168.1.100:4444', severity: 'critical', mitre: 'T1071.001', timestamp: Date.now() - 1000 * 60 * 4, alert: true },
  { id: 3, type: 'file', name: 'temp.exe', detail: 'Write to C:\\Users\\Public\\temp.exe', severity: 'medium', mitre: 'T1105', timestamp: Date.now() - 1000 * 60 * 3, alert: false },
  { id: 4, type: 'registry', name: 'reg.exe', detail: 'HKCU\\Run key modification for persistence', severity: 'high', mitre: 'T1547.001', timestamp: Date.now() - 1000 * 60 * 2, alert: true },
  { id: 5, type: 'process', name: 'cmd.exe', detail: 'whoami /priv execution', severity: 'low', mitre: 'T1082', timestamp: Date.now() - 1000 * 60 * 1, alert: false },
  { id: 6, type: 'dns', name: 'chrome.exe', detail: 'DNS query for malicious.domain.tld', severity: 'medium', mitre: 'T1071.004', timestamp: Date.now(), alert: false },
];

const mockRules = [
  { id: 1, name: 'PowerShell EncodedCommand', mitre: 'T1059.001', status: 'active', matches: 23 },
  { id: 2, name: 'Suspicious Network Connection', mitre: 'T1071.001', status: 'active', matches: 12 },
  { id: 3, name: 'Ingress Tool Transfer', mitre: 'T1105', status: 'active', matches: 8 },
  { id: 4, name: 'Registry Run Key Persistence', mitre: 'T1547.001', status: 'active', matches: 15 },
  { id: 5, name: 'System Information Discovery', mitre: 'T1082', status: 'inactive', matches: 0 },
  { id: 6, name: 'DNS Exfiltration Attempt', mitre: 'T1071.004', status: 'inactive', matches: 0 },
];

function LabPage() {
  const reducedMotion = useReducedMotion();
  const { gsap } = useGSAP();
  const sectionRef = useRef<HTMLSectionElement>(null);
  const [ref, isInView] = useInView<HTMLDivElement>({ triggerOnce: true, rootMargin: '0px 0px -50px 0px' });
  const eventsEndRef = useRef<HTMLDivElement>(null);

  const [events, setEvents] = useState(mockEvents);
  const [rules, setRules] = useState(mockRules);
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
      const types = ['process', 'network', 'file', 'registry', 'dns'];
      const names = ['powershell.exe', 'svchost.exe', 'cmd.exe', 'reg.exe', 'chrome.exe', 'notepad.exe', 'explorer.exe'];
      const details = [
        'Suspicious command line arguments',
        'Connection to known C2 IP',
        'Write to startup folder',
        'Registry modification for persistence',
        'DNS tunneling detected',
        'Process injection attempt',
        'Credential dumping via LSASS',
      ];
      const newEvent = {
        id: eventId,
        type: types[Math.floor(Math.random() * types.length)],
        name: names[Math.floor(Math.random() * names.length)],
        detail: details[Math.floor(Math.random() * details.length)],
        severity: severities[Math.floor(Math.random() * severities.length)],
        mitre: `T${1000 + Math.floor(Math.random() * 200)}.${String(Math.floor(Math.random() * 9)).padStart(3, '0')}`,
        timestamp: Date.now(),
        alert: Math.random() > 0.6,
      };
      setEvents(prev => [newEvent, ...prev.slice(0, 99)]);
      setEventId(prev => prev + 1);
    }, 3000);
    return () => clearInterval(interval);
  }, [isRunning, reducedMotion, eventId]);

  const filteredEvents = events.filter(e => {
    if (selectedSeverity !== 'all' && e.severity !== selectedSeverity) return false;
    if (selectedType !== 'all' && e.type !== selectedType) return false;
    if (searchQuery && !e.name.toLowerCase().includes(searchQuery.toLowerCase()) && !e.detail.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

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
                <span className="font-mono text-primary">blue-sentinel</span> Lab
              </h1>
              <p className="mt-1 text-muted-foreground">
                Interactive detection laboratory â€” Real-time synthetic event generation with Sigma-like detection engine
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={isRunning ? 'success' : 'secondary'} className="gap-1.5">
                <span className={cn('h-2 w-2 rounded-full', isRunning ? 'bg-success animate-pulse' : 'bg-muted-foreground')} />
                {isRunning ? 'LIVE' : 'PAUSED'}
              </Badge>
            </div>
          </div>
        </div>
      </header>

      <div className="container-wide py-8 px-6">
        <div className="grid gap-6 lg:grid-cols-12">
          <section ref={sectionRef} className="lab-card lg:col-span-8" aria-labelledby="events-title">
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <h2 id="events-title" className="text-lg font-semibold">Event Stream</h2>
                <Badge variant="outline" className="font-mono text-xs">
                  {events.length} events
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setIsRunning(!isRunning)} aria-label={isRunning ? 'Pause stream' : 'Resume stream'}>
                  {isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setEvents([]); setEventId(1); }} aria-label="Clear events">
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" aria-label="Export events">
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-2 sm:gap-4">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  type="search"
                  placeholder="Search events..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  aria-label="Search events by name or detail"
                />
              </div>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="w-[180px]" aria-label="Filter by event type">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {eventTypes.map((t) => (
                    <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedSeverity} onValueChange={setSelectedSeverity}>
                <SelectTrigger className="w-[160px]" aria-label="Filter by severity">
                  <SelectValue placeholder="All Severities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  {severities.map((s) => (
                    <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="h-[500px] overflow-y-auto scrollbar-hide border border-border/50 rounded-lg bg-background/50" role="log" aria-live="polite" aria-label="Security events">
              {filteredEvents.length === 0 ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <p>No events matching filters</p>
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
                              ALERT
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
                  Detection Stats
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <p className="text-2xl font-bold tabular-nums text-primary">{stats.total}</p>
                    <p className="text-xs text-muted-foreground">Total Events</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                    <p className="text-2xl font-bold tabular-nums text-destructive">{stats.alerts}</p>
                    <p className="text-xs text-muted-foreground">Alerts Triggered</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 rounded-lg bg-warning/5 border border-warning/20">
                    <p className="text-2xl font-bold tabular-nums text-warning">{stats.critical}</p>
                    <p className="text-xs text-muted-foreground">Critical</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <p className="text-2xl font-bold tabular-nums text-primary">{stats.high}</p>
                    <p className="text-xs text-muted-foreground">High</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="lab-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" aria-hidden="true" />
                    Detection Rules
                  </CardTitle>
                  <Badge variant="outline" className="font-mono text-xs">
                    {rules.filter(r => r.status === 'active').length} active
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
                          {rule.status === 'active' ? 'Active' : 'Inactive'}
                        </Badge>
                        <span className="text-xs text-muted-foreground font-mono">{rule.matches} matches</span>
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
                  Lab Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="label-base">Event Generation Rate</label>
                  <select className="input-base" defaultValue="3000">
                    <option value="1000">1 second</option>
                    <option value="3000">3 seconds</option>
                    <option value="5000">5 seconds</option>
                    <option value="10000">10 seconds</option>
                  </select>
                </div>
                <div>
                  <label className="label-base">Max Events in Buffer</label>
                  <select className="input-base" defaultValue="100">
                    <option value="50">50</option>
                    <option value="100">100</option>
                    <option value="200">200</option>
                    <option value="500">500</option>
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="auto-scroll" defaultChecked className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
                  <label htmlFor="auto-scroll" className="text-sm font-medium">Auto-scroll to new events</label>
                </div>
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="sound-alerts" className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
                  <label htmlFor="sound-alerts" className="text-sm font-medium">Sound on critical alerts</label>
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
