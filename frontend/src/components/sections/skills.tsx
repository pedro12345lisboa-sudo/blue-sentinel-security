'use client';

import { useEffect, useRef } from 'react';
import { Shield, Code, Terminal, Zap } from 'lucide-react';
import { useReducedMotion, useGSAP, useInView } from '@/hooks';
import { useSite } from '@/i18n';

const groupIcons = { Shield, Code, Terminal, Zap };

export function Skills() {
  const site = useSite();
  const reducedMotion = useReducedMotion();
  const { gsap } = useGSAP();
  const sectionRef = useRef<HTMLElement>(null);
  const [ref, isInView] = useInView<HTMLDivElement>({ triggerOnce: true, rootMargin: '0px 0px -100px 0px' });

  useEffect(() => {
    if (reducedMotion || !gsap || !isInView) return;

    const ctx = gsap.context(() => {
      gsap.from('.skill-card', {
        y: 30,
        opacity: 0,
        duration: 0.6,
        stagger: 0.08,
        ease: 'expo.out',
      });
    }, sectionRef);

    return () => ctx.revert();
  }, [gsap, reducedMotion, isInView]);

  const { skills } = site.sections;

  return (
    <section
      ref={sectionRef}
      className="section bg-gradient-to-b from-background to-card/50"
      aria-labelledby="skills-title"
    >
      <div className="container-wide">
        <div className="mb-12 text-center">
          <h2 id="skills-title" className="heading-section text-display-md mb-4">
            {skills.title}
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {skills.description}
          </p>
        </div>

        <div ref={ref} className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {skills.groups.map((group) => {
            const Icon = groupIcons[group.icon as keyof typeof groupIcons] ?? Shield;
            return (
              <article
                key={group.title}
                className="skill-card group relative rounded-2xl border border-border/50 bg-card/50 p-6 transition-all duration-300 hover:border-primary/30 hover:shadow-glow hover:bg-card"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </div>
                <h3 className="mb-4 text-lg font-semibold text-foreground">{group.title}</h3>
                <ul className="space-y-2">
                  {group.items.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary/50" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
