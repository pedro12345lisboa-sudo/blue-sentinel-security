'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Terminal, Play, Pause, RotateCcw, Zap, Shield, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useReducedMotion, useGSAP, useInView } from '@/hooks';

const syntheticEvents = [
  { type: 'process', name: 'powershell.exe', detail: 'EncodedCommand execution', severity: 'high', mitre: 'T1059.001' },
  { type: 'network', name: 'svchost.exe', detail: 'Connection to 192.168.1.100:4444', severity: 'critical', mitre: 'T1071.001' },
  { type: 'file', name: 'temp.exe', detail: 'Write to C:\\Users\\Public\\', severity: 'medium', mitre: 'T1105' },
  { type: 'registry', name: 'reg.exe', detail: 'HKCU\\Run key modification', severity: 'high', mitre: 'T1547.001' },
  { type: 'process', name: 'cmd.exe', detail: 'whoami /priv execution', severity: 'low', mitre: 'T1082' },
  { type: 'network', name: 'chrome.exe', detail: 'DNS query for malicious.domain', severity: 'medium', mitre: 'T1071.004' },
];

export function LabTeaser() {
  const reducedMotion = useReducedMotion();
  const { gsap } = useGSAP();
  const sectionRef = useRef<HTMLSectionElement>(null);
  const [ref, isInView] = useInView<HTMLDivElement>({ triggerOnce: true, rootMargin: '0px 0px -100px 0px' });
  const [activeEvent, setActiveEvent] = useState(0);
  const [isRunning, setIsRunning] = useState(true);

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
    if (!isRunning || reducedMotion) return;
    const interval = setInterval(() => {
      setActiveEvent((prev) => (prev + 1) % syntheticEvents.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [isRunning, reducedMotion]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-destructive border-destructive/30 bg-destructive/10';
      case 'high': return 'text-warning border-warning/30 bg-warning/10';
      case 'medium': return 'text-primary border-primary/30 bg-primary/10';
      case 'low': return 'text-success border-success/30 bg-success/10';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <section
      ref={sectionRef}
      className="section bg-gradient-to-b from-card/50 to-background"
      aria-labelledby="lab-title"
    >
      <div className="container-wide">
        <div className="mb-12 flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="text-center sm:text-left">
            <h2 id="lab-title" className="heading-section text-display-md mb-2">
              Interactive Detection Lab
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl">
              Real-time synthetic security event generation with Sigma-like detection engine.
              Watch alerts trigger live as events flow through the pipeline.
            </p>
          </div>
          <Link href="/lab" className="btn-primary self-center whitespace-nowrap">
            Open Lab
            <Terminal className="h-4 w-4 ml-2" aria-hidden="true" />
          </Link>
        </div>

        <div ref={ref} className="grid gap-6 lg:grid-cols-3">
          <article className="lab-card lg:col-span-2 relative rounded-2xl border border-border/50 bg-card/50 p-6 overflow-hidden">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={cn('flex h-2.5 w-2.5 rounded-full', isRunning ? 'bg-success animate-pulse' : 'bg-muted-foreground')}
                  aria-label={isRunning ? 'Lab running' : 'Lab paused'}
                />
                <span className="text-sm font-medium text-foreground">
                  {isRunning ? 'LIVE' : 'PAUSED'}
                </span>
                <Badge variant="outline" className="text-xs font-mono">
                  WebSocket Connected
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsRunning(!isRunning)}
                  aria-label={isRunning ? 'Pause event stream' : 'Resume event stream'}
                >
                  {isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveEvent(0)}
                  aria-label="Restart event stream"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-3 max-h-[400px] overflow-y-auto scrollbar-hide" role="log" aria-live="polite" aria-label="Security events stream">
              {syntheticEvents.map((event, index) => (
                <div
                  key={event.type + index}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-lg border transition-all duration-300',
                    index === activeEvent ? 'border-primary/50 bg-primary/5 shadow-glow' : 'border-border/50'
                  )}
                  role="listitem"
                >
                  <div className="flex-shrink-0 mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    {event.type === 'process' && <Terminal className="h-4 w-4" />}
                    {event.type === 'network' && <Activity className="h-4 w-4" />}
                    {event.type === 'file' && <Shield className="h-4 w-4" />}
                    {event.type === 'registry' && <Zap className="h-4 w-4" />}
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
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{event.detail}</p>
                  </div>
                  {index === activeEvent && (
                    <span className="flex-shrink-0 text-xs font-mono text-primary animate-pulse">
                      NEW
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-6 flex items-center justify-between text-sm text-muted-foreground">
              <span>Auto-generating synthetic events every 3s</span>
              <span className="font-mono">0 alerts triggered</span>
            </div>
          </article>

          <article className="lab-card relative rounded-2xl border border-border/50 bg-card/50 p-6">
            <h3 className="mb-4 text-lg font-semibold text-foreground">Detection Rules</h3>
            <div className="space-y-3">
              {[
                { name: 'PowerShell EncodedCommand', mitre: 'T1059.001', status: 'active' },
                { name: 'Suspicious Network Connection', mitre: 'T1071.001', status: 'active' },
                { name: 'Ingress Tool Transfer', mitre: 'T1105', status: 'active' },
                { name: 'Registry Run Key Persistence', mitre: 'T1547.001', status: 'active' },
                { name: 'System Information Discovery', mitre: 'T1082', status: 'inactive' },
                { name: 'DNS Exfiltration', mitre: 'T1071.004', status: 'inactive' },
              ].map((rule) => (
                <div
                  key={rule.name}
                  className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/50"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{rule.name}</p>
                    <p className="text-xs font-mono text-muted-foreground">{rule.mitre}</p>
                  </div>
                  <Badge
                    variant={rule.status === 'active' ? 'success' : 'ghost'}
                    className="text-xs"
                  >
                    {rule.status === 'active' ? 'Ativa' : 'Inativa'}
                  </Badge>
                </div>
              ))}
            </div>
            <div className="mt-6 p-4 rounded-lg bg-primary/5 border border-primary/20">
              <p className="text-sm text-primary">
                <strong>7 regras ativas</strong> de 12 no motor de detecção
              </p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}