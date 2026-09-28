'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowRight, Github, ExternalLink, Shield, Code, Zap, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useReducedMotion, useGSAP, useInView } from '@/hooks';

const featuredProjects = [
  {
    slug: 'blue-sentinel',
    title: 'Blue-Sentinel',
    description: 'Full-stack cybersecurity portfolio with interactive detection lab, real-time metrics, and synthetic event generation.',
    longDescription: 'A complete portfolio platform featuring a Next.js frontend, FastAPI backend, PostgreSQL database, and Redis cache. Includes a real-time detection laboratory that generates synthetic security events and evaluates them against Sigma-like detection rules via WebSocket.',
    tags: ['Next.js', 'FastAPI', 'PostgreSQL', 'Redis', 'WebSocket', 'Sigma', 'Docker'],
    icon: Shield,
    highlight: true,
    links: { github: '#', demo: '/lab' },
  },
  {
    slug: 'sentinel-agent',
    title: 'Sentinel Agent (C++)',
    description: 'High-performance C++20 security agent for endpoint telemetry collection with HMAC authentication and Sigma rule evaluation.',
    longDescription: 'Cross-platform C++20 agent using CMake, featuring modular architecture for Linux (eBPF, auditd) and Windows (ETW, WMI). Implements HMAC-SHA256 authentication, structured logging, and efficient event batching with backpressure handling.',
    tags: ['C++20', 'CMake', 'eBPF', 'ETW', 'HMAC', 'Sigma', 'ZeroMQ'],
    icon: Code,
    highlight: true,
    links: { github: '#', demo: null },
  },
  {
    slug: 'detection-pipeline',
    title: 'Detection Pipeline',
    description: 'Automated Sigma rule validation, testing, and deployment pipeline with GitHub Actions integration.',
    longDescription: 'CI/CD pipeline for detection engineering: linting Sigma rules, unit testing with synthetic logs, false positive analysis, and automated deployment to SIEM. Includes rule coverage mapping to MITRE ATT&CK.',
    tags: ['Python', 'GitHub Actions', 'Sigma', 'MITRE ATT&CK', 'Docker', 'pytest'],
    icon: Zap,
    highlight: false,
    links: { github: '#', demo: null },
  },
  {
    slug: 'threat-hunt-framework',
    title: 'Threat Hunt Framework',
    description: 'Hypothesis-driven threat hunting framework with Jupyter notebooks, ATT&CK mapping, and automated timeline generation.',
    longDescription: 'Framework for structured threat hunting: hypothesis management, data source inventory, query library (KQL, Splunk, Elastic), ATT&CK technique mapping, and automated hunt report generation with timeline visualization.',
    tags: ['Python', 'Jupyter', 'KQL', 'MITRE ATT&CK', 'Pandas', 'Plotly'],
    icon: Terminal,
    highlight: false,
    links: { github: '#', demo: null },
  },
];

export function FeaturedProjects() {
  const reducedMotion = useReducedMotion();
  const { gsap } = useGSAP();
  const sectionRef = useRef<HTMLSectionElement>(null);
  const [ref, isInView] = useInView<HTMLDivElement>({ triggerOnce: true, rootMargin: '0px 0px -100px 0px' });

  useEffect(() => {
    if (reducedMotion || !gsap || !isInView) return;

    const ctx = gsap.context(() => {
      gsap.from('.project-card', {
        y: 30,
        opacity: 0,
        duration: 0.6,
        stagger: 0.1,
        ease: 'expo.out',
      });
    }, sectionRef);

    return () => ctx.revert();
  }, [gsap, reducedMotion, isInView]);

  return (
    <section
      ref={sectionRef}
      className="section"
      aria-labelledby="projects-title"
    >
      <div className="container-wide">
        <div className="mb-12 flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="text-center sm:text-left">
            <h2 id="projects-title" className="heading-section text-display-md mb-2">
              Featured Projects
            </h2>
            <p className="text-lg text-muted-foreground">
              Selected works showcasing detection engineering, security automation, and systems programming.
            </p>
          </div>
          <Link href="/projects" className="btn-outline self-center whitespace-nowrap">
            View All Projects
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <div ref={ref} className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {featuredProjects.map((project) => (
            <article
              key={project.slug}
              className="project-card group relative rounded-2xl border border-border/50 bg-card/50 p-6 transition-all duration-300 hover:border-primary/30 hover:shadow-glow hover:bg-card flex flex-col"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <project.icon className="h-6 w-6" aria-hidden="true" />
              </div>
              {project.highlight && (
                <Badge variant="success" className="mb-3 w-fit">
                  Destaque
                </Badge>
              )}
              <h3 className="mb-2 text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                {project.title}
              </h3>
              <p className="mb-4 flex-1 text-sm text-muted-foreground">
                {project.description}
              </p>
              <div className="mb-4 flex flex-wrap gap-2">
                {project.tags.slice(0, 4).map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
                {project.tags.length > 4 && (
                  <Badge variant="ghost" className="text-xs">
                    +{project.tags.length - 4}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 pt-4 border-t border-border/50">
                <Link
                  href={project.links.github}
                  className="btn-ghost text-xs gap-1.5"
                  aria-label={`Ver código do ${project.title} no GitHub`}
                >
                  <Github className="h-3.5 w-3.5" aria-hidden="true" />
                  Código
                </Link>
                {project.links.demo && (
                  <Link
                    href={project.links.demo}
                    className="btn-ghost text-xs gap-1.5"
                    aria-label={`Ver demo do ${project.title}`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    Demo
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}