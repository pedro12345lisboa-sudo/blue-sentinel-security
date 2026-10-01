'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Mail, ArrowRight, Send } from 'lucide-react';
import { useReducedMotion, useGSAP, useInView } from '@/hooks';
import { site } from '../../../content/site';

export function CTA() {
  const reducedMotion = useReducedMotion();
  const { gsap } = useGSAP();
  const sectionRef = useRef<HTMLElement>(null);
  const [ref, isInView] = useInView<HTMLDivElement>({ triggerOnce: true, rootMargin: '0px 0px -50px 0px' });

  useEffect(() => {
    if (reducedMotion || !gsap || !isInView) return;

    const ctx = gsap.context(() => {
      gsap.from('.cta-content', {
        y: 30,
        opacity: 0,
        duration: 0.8,
        ease: 'expo.out',
      });
    }, sectionRef);

    return () => ctx.revert();
  }, [gsap, reducedMotion, isInView]);

  const { cta } = site.sections;
  const emailKey = cta.emailNote.addressKey as keyof typeof site.contacts;

  return (
    <section
      ref={sectionRef}
      className="section relative overflow-hidden"
      aria-labelledby="cta-title"
    >
      <div className="absolute inset-0 gradient-mesh" aria-hidden="true" />
      <div className="absolute inset-0 noise-overlay" aria-hidden="true" />
      <div className="absolute inset-0 grid-pattern opacity-20" aria-hidden="true" />

      <div ref={ref} className="relative mx-auto max-w-3xl px-6 text-center cta-content">
        <div className="mb-6 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-mono border border-primary/20">
          <span>{cta.badge}</span>
        </div>

        <h2 id="cta-title" className="mb-6 text-display-md font-display font-bold tracking-tight text-balance">
          {cta.title}
        </h2>

        <p className="mb-8 text-lg text-muted-foreground max-w-xl mx-auto text-balance">
          {cta.description}
        </p>

        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link href={cta.primary.href} className="btn-primary w-full max-w-xs group">
            <Mail className="h-4 w-4 mr-2" aria-hidden="true" />
            {cta.primary.label}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </Link>
          <Link href={cta.secondary.href} className="btn-outline w-full max-w-xs">
            <Send className="h-4 w-4 mr-2" aria-hidden="true" />
            {cta.secondary.label}
          </Link>
        </div>

        <p className="mt-8 text-sm text-muted-foreground/70">
          {cta.emailNote.prefix}{' '}
          <a href={`mailto:${site.contacts[emailKey]}`} className="text-primary hover:underline font-medium">
            {site.contacts[emailKey]}
          </a>
        </p>
      </div>
    </section>
  );
}
