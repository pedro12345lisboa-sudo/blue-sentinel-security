'use client';

import { useEffect, useRef, useState } from 'react';
import { Terminal, Play, Pause, RotateCcw, Zap, Shield, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useReducedMotion, useGSAP, useInView } from '@/hooks';
import { useSite, LocalizedLink } from '@/i18n';

const typeIcons: Record<string, typeof Terminal> = {
  process: Terminal,
  network: Activity,
  file: Shield,
  registry: Zap,
};

export function LabTeaser() {
  const site = useSite();
  const reducedMotion = useReducedMotion();
  const { gsap } = useGSAP();
  const sectionRef = useRef<HTMLElement>(null);
  const [ref, isInView] = useInView<HTMLDivElement>({ triggerOnce: true, rootMargin: '0px 0px -100px 0px' });
  const [activeEvent, setActiveEvent] = useState(0);
  const [isRunning, setIsRunning] = useState(true);

  const { labTeaser } = site.sections;
  const events = labTeaser.events;
  const rules = labTeaser.rules.items;

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
      setActiveEvent((prev) => (prev + 1) % events.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [isRunning, reducedMotion, events.length]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-destructive border-destructive/30 bg-destructive/10';
      case 'high': return 'text-warning border-warning/30 bg-warning/10';
      case 'medium': return 'text-primary border-primary/30 bg-primary/10';
      case 'low': return 'text-success border-success/30 bg-success/10';
      default: return 'text-muted-foreground';
    }
  };

  const activeRules = rules.filter((rule) => rule.status === 'active').length;

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
              {labTeaser.title}
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl">
              {labTeaser.description}
            </p>
          </div>
          <LocalizedLink href={labTeaser.cta.href} className="btn-primary self-center whitespace-nowrap">
            {labTeaser.cta.label}
            <Terminal className="h-4 w-4 ml-2" aria-hidden="true" />
          </LocalizedLink>
        </div>

        <div ref={ref} className="grid gap-6 lg:grid-cols-3">
          <article className="lab-card lg:col-span-2 relative rounded-2xl border border-border/50 bg-card/50 p-6 overflow-hidden">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className={cn('flex h-2.5 w-2.5 rounded-full', isRunning ? 'bg-success animate-pulse' : 'bg-muted-foreground')}
                  role="img"
                  aria-label={isRunning ? labTeaser.stream.ariaRunning : labTeaser.stream.ariaStopped}
                />
                <span className="text-sm font-medium text-foreground">
                  {isRunning ? labTeaser.stream.live : labTeaser.stream.paused}
                </span>
                <Badge variant="outline" className="text-xs font-mono">
                  {labTeaser.stream.connected}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsRunning(!isRunning)}
                  aria-label={isRunning ? labTeaser.stream.ariaPause : labTeaser.stream.ariaResume}
                >
                  {isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveEvent(0)}
                  aria-label={labTeaser.stream.ariaRestart}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div
              className="space-y-3 max-h-[400px] overflow-y-auto scrollbar-hide"
              role="log"
              aria-live="polite"
              aria-label={labTeaser.stream.ariaLabel}
              tabIndex={0}
            >
              <div role="list">
                {events.map((event, index) => {
                const Icon = typeIcons[event.type] ?? Terminal;
                return (
                  <div
                    key={event.type + index}
                    className={cn(
                      'flex items-start gap-3 p-3 rounded-lg border transition-all duration-300',
                      index === activeEvent ? 'border-primary/50 bg-primary/5 shadow-glow' : 'border-border/50'
                    )}
                    role="listitem"
                  >
                    <div className="flex-shrink-0 mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" aria-hidden="true" />
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
                        {labTeaser.stream.new}
                      </span>
                    )}
                  </div>
                );
              })}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between text-sm text-muted-foreground">
              <span>{labTeaser.stream.generating}</span>
              <span className="font-mono">{labTeaser.stream.alerts}</span>
            </div>
          </article>

          <article className="lab-card relative rounded-2xl border border-border/50 bg-card/50 p-6">
            <h3 className="mb-4 text-lg font-semibold text-foreground">{labTeaser.rules.title}</h3>
            <div className="space-y-3">
              {rules.map((rule) => (
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
                    {rule.status === 'active' ? labTeaser.rules.active : labTeaser.rules.inactive}
                  </Badge>
                </div>
              ))}
            </div>
            <div className="mt-6 p-4 rounded-lg bg-primary/5 border border-primary/20">
              <p className="text-sm text-primary">
                <strong>{activeRules}</strong> {labTeaser.rules.summaryActive} {rules.length}{' '}
                {labTeaser.rules.summaryTail}
              </p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
