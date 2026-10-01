'use client';

import { useEffect, useRef } from 'react';
import { Shield, FileText, Code, Terminal, Zap, Award } from 'lucide-react';
import { useCounter, useReducedMotion, useGSAP, useInView } from '@/hooks';
import { site } from '../../../content/site';

const counterIcons = { Shield, FileText, Code, Terminal, Zap, Award };

type CounterItem = (typeof site.sections.counters.items)[number];

function CounterCard({ counter }: { counter: CounterItem }) {
  const Icon = counterIcons[counter.icon as keyof typeof counterIcons] ?? Shield;
  const hasValue = typeof counter.value === 'number';
  const { count } = useCounter({
    end: counter.value ?? 0,
    duration: 2500,
    suffix: counter.suffix,
    start: 0,
  });

  return (
    <article className="counter-card group relative rounded-2xl border border-border/50 bg-card/50 p-6 text-center transition-all duration-300 hover:border-primary/30 hover:shadow-glow hover:bg-card">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mx-auto group-hover:scale-110 transition-transform">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <div
        className="mb-2 text-display-sm font-display font-bold text-foreground tabular-nums"
        aria-live="polite"
      >
        {hasValue ? count : counter.placeholder}
      </div>
      <p className="text-sm text-muted-foreground">{counter.label}</p>
    </article>
  );
}

export function Counters() {
  const reducedMotion = useReducedMotion();
  const { gsap } = useGSAP();
  const sectionRef = useRef<HTMLElement>(null);
  const [ref, isInView] = useInView<HTMLDivElement>({ triggerOnce: true, rootMargin: '0px 0px -50px 0px' });

  const { counters } = site.sections;

  useEffect(() => {
    if (reducedMotion || !gsap || !isInView) return;

    const ctx = gsap.context(() => {
      gsap.from('.counter-card', {
        y: 30,
        opacity: 0,
        duration: 0.6,
        stagger: 0.08,
        ease: 'expo.out',
      });
    }, sectionRef);

    return () => ctx.revert();
  }, [gsap, reducedMotion, isInView]);

  return (
    <section
      ref={sectionRef}
      className="section bg-gradient-to-b from-background to-card/50"
      aria-labelledby="counters-title"
    >
      <div className="container-wide">
        <div className="mb-12 text-center">
          <h2 id="counters-title" className="heading-section text-display-md mb-4">
            {counters.title}
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {counters.description}
          </p>
        </div>

        <div ref={ref} className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {counters.items.map((counter) => (
            <CounterCard key={counter.label} counter={counter} />
          ))}
        </div>
      </div>
    </section>
  );
}
