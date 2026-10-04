'use client';

import { useEffect, useRef } from 'react';
import { ArrowRight, Github, ExternalLink, Shield, Code, Zap, Terminal, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useReducedMotion, useGSAP, useInView } from '@/hooks';
import { useSite, LocalizedLink } from '@/i18n';

export interface FeaturedProject {
  slug: string;
  title: string;
  description: string;
  tags: string[];
  icon?: string;
  highlight?: boolean;
  links?: { github?: string; demo?: string; docs?: string };
}

const icons = { Shield, Code, Zap, Terminal, FileText };

interface FeaturedProjectsProps {
  projects: FeaturedProject[];
}

export function FeaturedProjects({ projects }: FeaturedProjectsProps) {
  const site = useSite();
  const reducedMotion = useReducedMotion();
  const { gsap } = useGSAP();
  const sectionRef = useRef<HTMLElement>(null);
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

  const { featuredProjects } = site.sections;

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
              {featuredProjects.title}
            </h2>
            <p className="text-lg text-muted-foreground">
              {featuredProjects.description}
            </p>
          </div>
          <LocalizedLink href={featuredProjects.cta.href} className="btn-outline self-center whitespace-nowrap">
            {featuredProjects.cta.label}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </LocalizedLink>
        </div>

        <div ref={ref} className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {projects.length === 0 && (
            <p className="text-center text-muted-foreground sm:col-span-2 lg:col-span-3">
              {featuredProjects.empty}
            </p>
          )}
          {projects.map((project) => {
            const Icon = icons[(project.icon ?? 'Shield') as keyof typeof icons] ?? Shield;
            return (
              <article
                key={project.slug}
                className="project-card group relative rounded-2xl border border-border/50 bg-card/50 p-6 transition-all duration-300 hover:border-primary/30 hover:shadow-glow hover:bg-card flex flex-col"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </div>
                {project.highlight && (
                  <Badge variant="success" className="mb-3 w-fit">
                    {featuredProjects.labels.highlight}
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
                      +{project.tags.length - 4} {featuredProjects.labels.moreTags}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 pt-4 border-t border-border/50">
                  {project.links?.github && (
                    <LocalizedLink
                      href={project.links.github}
                      className="btn-ghost text-xs gap-1.5"
                      aria-label={`${featuredProjects.labels.ariaCode}: ${project.title}`}
                    >
                      <Github className="h-3.5 w-3.5" aria-hidden="true" />
                      {featuredProjects.labels.code}
                    </LocalizedLink>
                  )}
                  {project.links?.demo && (
                    <LocalizedLink
                      href={project.links.demo}
                      className="btn-ghost text-xs gap-1.5"
                      aria-label={`${featuredProjects.labels.ariaDemo}: ${project.title}`}
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      {featuredProjects.labels.demo}
                    </LocalizedLink>
                  )}
                  {project.links?.docs && (
                    <LocalizedLink
                      href={project.links.docs}
                      className="btn-ghost text-xs gap-1.5"
                      aria-label={`${featuredProjects.labels.ariaDocs}: ${project.title}`}
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      {featuredProjects.labels.docs}
                    </LocalizedLink>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
