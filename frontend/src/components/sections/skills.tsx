'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useReducedMotion, useGSAP, useInView } from '@/hooks';

const skills = [
  { category: 'Detection Engineering', items: ['Sigma Rules', 'YARA', 'MITRE ATT&CK', 'Alert Tuning', 'Log Analysis', 'Threat Intelligence'] },
  { category: 'Security Automation', items: ['SOAR Playbooks', 'Python/Go Tooling', 'CI/CD Security Gates', 'API Integration', 'Workflow Orchestration', 'Incident Response'] },
  { category: 'Threat Hunting', items: ['Hypothesis-Driven Hunts', 'Behavioral Analytics', 'ATT&CK Coverage Mapping', 'Anomaly Detection', 'Data Visualization', 'Purple Teaming'] },
  { category: 'Systems Programming', items: ['C++20', 'eBPF', 'Kernel Modules', 'Performance Optimization', 'Memory Forensics', 'Network Programming'] },
];

export function Skills() {
  const reducedMotion = useReducedMotion();
  const { gsap } = useGSAP();
  const sectionRef = useRef<HTMLSectionElement>(null);
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

  return (
    <section
      ref={sectionRef}
      className="section bg-gradient-to-b from-background to-card/50"
      aria-labelledby="skills-title"
    >
      <div className="container-wide">
        <div className="mb-12 text-center">
          <h2 id="skills-title" className="heading-section text-display-md mb-4">
            Core Competencies
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Technical focus areas built through hands-on experience in SOC operations, detection engineering, and security tooling development.
          </p>
        </div>

        <div ref={ref} className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {skills.map((skill, index) => (
            <article
              key={skill.category}
              className="skill-card group relative rounded-2xl border border-border/50 bg-card/50 p-6 transition-all duration-300 hover:border-primary/30 hover:shadow-glow hover:bg-card"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <span className="text-2xl" aria-hidden="true">{index + 1}</span>
              </div>
              <h3 className="mb-4 text-lg font-semibold text-foreground">{skill.category}</h3>
              <ul className="space-y-2" role="list">
                {skill.items.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/50" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}