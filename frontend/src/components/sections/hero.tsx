'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowRight, Terminal, Shield, Code, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReducedMotion, useGSAP } from '@/hooks';
import { site } from '../../../content/site';

const highlightIcons = { Shield, Code, Zap };

export function Hero() {
  const reducedMotion = useReducedMotion();
  const { gsap } = useGSAP();
  const heroRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const threeSlotRef = useRef<HTMLDivElement>(null);

  const variant =
    site.hero.variants[site.hero.activeVariant] ?? site.hero.variants[0];

  useEffect(() => {
    if (reducedMotion || !gsap) return;

    const ctx = gsap.context(() => {
      gsap.from(textRef.current?.children || [], {
        y: 40,
        opacity: 0,
        duration: 0.8,
        stagger: 0.15,
        ease: 'expo.out',
      });

      gsap.from(ctaRef.current?.children || [], {
        y: 30,
        opacity: 0,
        duration: 0.6,
        stagger: 0.1,
        delay: 0.4,
        ease: 'expo.out',
      });

      gsap.from(threeSlotRef.current, {
        scale: 0.95,
        opacity: 0,
        duration: 1,
        delay: 0.2,
        ease: 'expo.out',
      });
    }, heroRef);

    return () => ctx.revert();
  }, [gsap, reducedMotion]);

  return (
    <section
      ref={heroRef}
      className="relative min-h-[90vh] flex items-center justify-center overflow-hidden px-4 py-20 sm:py-32"
      aria-labelledby="hero-title"
    >
      <div className="absolute inset-0 gradient-mesh" aria-hidden="true" />
      <div className="absolute inset-0 noise-overlay" aria-hidden="true" />
      <div className="absolute inset-0 grid-pattern opacity-20" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl px-6">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div ref={textRef} className="text-center lg:text-left">
            <div className="mb-6 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
              {site.hero.badges.map((badge) => (
                <span
                  key={badge}
                  className="px-3 py-1 text-xs font-mono bg-primary/10 text-primary rounded-full border border-primary/20"
                >
                  {badge}
                </span>
              ))}
            </div>

            <h1
              id="hero-title"
              className="mb-6 text-display-xl font-display font-bold tracking-tight text-balance"
            >
              <span className="font-mono text-primary">{site.brand.name}</span>{' '}
              <span className="text-foreground">{variant.title}</span>
            </h1>

            <p className="mb-8 max-w-xl text-lg text-muted-foreground lg:text-xl mx-auto lg:mx-0 text-balance">
              {variant.subtitle}
            </p>

            <div ref={ctaRef} className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href={site.hero.ctas.primary.href}
                className="btn-primary w-full max-w-xs"
              >
                {site.hero.ctas.primary.label}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href={site.hero.ctas.secondary.href}
                className="btn-outline w-full max-w-xs"
              >
                <Terminal className="h-4 w-4 mr-2" aria-hidden="true" />
                {site.hero.ctas.secondary.label}
              </Link>
            </div>

            <div className="mt-12 flex flex-wrap items-center justify-center gap-8 text-sm text-muted-foreground">
              {site.hero.highlights.map((item) => {
                const Icon = highlightIcons[item.icon as keyof typeof highlightIcons] ?? Shield;
                return (
                  <div key={item.label} className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                    <span>{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div ref={threeSlotRef} className="relative">
            <div
              className="aspect-square max-w-xl mx-auto rounded-2xl bg-gradient-to-br from-primary/10 via-transparent to-success/10 border border-primary/20 flex items-center justify-center overflow-hidden"
              role="img"
              aria-label={site.hero.visual.label}
            >
              <div className="text-center p-8">
                <div className="mb-4 text-6xl animate-pulse" aria-hidden="true">
                  {site.hero.visual.fallback}
                </div>
                <p className="text-muted-foreground font-mono text-sm">
                  {site.hero.visual.title}
                </p>
                <p className="text-xs text-muted-foreground/50 mt-1">
                  {site.hero.visual.hint}
                </p>
              </div>
            </div>

            <div className="absolute -bottom-6 -right-6 w-72 h-72 bg-primary/5 rounded-full blur-3xl" aria-hidden="true" />
            <div className="absolute -top-6 -left-6 w-72 h-72 bg-success/5 rounded-full blur-3xl" aria-hidden="true" />
          </div>
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce" aria-hidden="true">
        <svg className="h-6 w-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </div>
    </section>
  );
}
