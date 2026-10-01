'use client';

import { useEffect, useRef } from 'react';
import {
  Award,
  Code,
  GraduationCap,
  Search,
  Shield,
  Terminal,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { gsap } from 'gsap';
import { useReducedMotion, useInView } from '@/hooks';
import { useSite, type Messages } from '@/i18n';

export interface AboutFocusArea {
  title: string;
  description: string;
  icon?: string;
}

export interface AboutTimelineItem {
  period: string;
  title: string;
  org: string;
  description: string;
  tags?: string[];
  icon?: string;
}

export interface AboutCertification {
  name: string;
  issuer: string;
  year: string;
  status?: string;
}

export interface AboutPhilosophyItem {
  title: string;
  body: string;
}

interface AboutViewProps {
  focusAreas: AboutFocusArea[];
  timeline: AboutTimelineItem[];
  certifications: AboutCertification[];
  philosophy: AboutPhilosophyItem[];
}

const iconMap: Record<string, LucideIcon> = {
  Shield,
  Search,
  Zap,
  Terminal,
  GraduationCap,
  Code,
  Award,
};

function getIcon(name?: string): LucideIcon {
  const icon = name ? iconMap[name] : undefined;
  return icon ?? Shield;
}

function getStatusLabel(
  status?: string,
  labels?: Messages['pages']['about']['certifications']['status']
): string | undefined {
  if (status === 'active') return labels?.active;
  if (status === 'planned') return labels?.planned;
  return status;
}

export function AboutView({
  focusAreas,
  timeline,
  certifications,
  philosophy,
}: AboutViewProps) {
  const site = useSite();
  const reducedMotion = useReducedMotion();

  const sectionRef = useRef<HTMLElement | null>(null);

  const [ref, isInView] = useInView<HTMLDivElement>({
    triggerOnce: true,
    rootMargin: '0px 0px -50px 0px',
  });

  useEffect(() => {
    if (reducedMotion || !isInView) return;

    const ctx = gsap.context(() => {
      gsap.from('.timeline-item', {
        x: -30,
        opacity: 0,
        duration: 0.6,
        stagger: 0.1,
        ease: 'expo.out',
      });

      gsap.from('.cert-card', {
        y: 20,
        opacity: 0,
        duration: 0.5,
        stagger: 0.05,
        ease: 'expo.out',
      });

      gsap.from('.focus-card', {
        y: 30,
        opacity: 0,
        duration: 0.6,
        stagger: 0.1,
        ease: 'expo.out',
      });
    }, sectionRef.current ?? undefined);

    return () => ctx.revert();
  }, [reducedMotion, isInView]);

  return (
    <>
      <section
        ref={sectionRef}
        className="section"
        aria-labelledby="focus-title"
      >
        <div className="container-wide">
          <div className="mb-12 text-center">
            <h2
              id="focus-title"
              className="heading-section text-display-md mb-4"
            >
              {site.pages.about.focus.title}
            </h2>

            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {site.pages.about.focus.description}
            </p>
          </div>

          <div
            ref={ref}
            className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
          >
            {focusAreas.map((area) => {
              const Icon = getIcon(area.icon);

              return (
                <article
                  key={area.title}
                  className="focus-card group relative rounded-2xl border border-border/50 bg-card/50 p-6 transition-all duration-300 hover:border-primary/30 hover:shadow-glow hover:bg-card"
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </div>

                  <h3 className="mb-3 text-lg font-semibold text-foreground">
                    {area.title}
                  </h3>

                  <p className="text-sm text-muted-foreground">
                    {area.description}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section
        className="section bg-gradient-to-b from-background to-card/50"
        aria-labelledby="experience-title"
      >
        <div className="container-wide">
          <div className="mb-12 text-center">
            <h2
              id="experience-title"
              className="heading-section text-display-md mb-4"
            >
              {site.pages.about.timeline.title}
            </h2>

            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {site.pages.about.timeline.description}
            </p>
          </div>

          {timeline.length === 0 ? (
            <p className="text-center text-muted-foreground">
              {site.pages.about.timeline.empty}
            </p>
          ) : (
            <div className="relative">
              <div
                className="absolute left-8 top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary/50 via-primary to-transparent"
                aria-hidden="true"
              />

              <div className="space-y-12" role="list">
                {timeline.map((item, index) => {
                  const Icon = getIcon(item.icon);

                  return (
                    <article
                      key={`${item.period}-${index}`}
                      className="timeline-item relative pl-20 group"
                      role="listitem"
                    >
                      <div className="absolute left-0 top-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary border-4 border-background z-10">
                        <Icon
                          className="h-6 w-6 text-primary"
                          aria-hidden="true"
                        />
                      </div>

                      <div className="mb-2 flex items-center gap-3">
                        <span className="text-sm font-mono text-primary font-semibold">
                          {item.period}
                        </span>

                        <h3 className="text-lg font-semibold text-foreground">
                          {item.title}
                        </h3>

                        <span className="px-2 py-0.5 text-xs font-mono bg-secondary text-muted-foreground rounded">
                          {item.org}
                        </span>
                      </div>

                      <p className="mb-3 text-muted-foreground">
                        {item.description}
                      </p>

                      <div className="flex flex-wrap gap-2">
                        {item.tags?.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-1 text-xs font-mono bg-secondary/50 text-muted-foreground rounded border border-border/50"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      <section
        className="section"
        aria-labelledby="certifications-title"
      >
        <div className="container-wide">
          <div className="mb-12 text-center">
            <h2
              id="certifications-title"
              className="heading-section text-display-md mb-4"
            >
              {site.pages.about.certifications.title}
            </h2>

            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {site.pages.about.certifications.description}
            </p>
          </div>

          {certifications.length === 0 ? (
            <p className="text-center text-muted-foreground">
              {site.pages.about.certifications.empty}
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
              {certifications.map((cert, index) => (
                <article
                  key={`${cert.name}-${index}`}
                  className="cert-card group relative rounded-xl border border-border/50 bg-card/50 p-5 text-center transition-all duration-300 hover:border-primary/30 hover:shadow-glow hover:bg-card"
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mx-auto">
                    <Award className="h-5 w-5" aria-hidden="true" />
                  </div>

                  <h3 className="font-semibold text-foreground">
                    {cert.name}
                  </h3>

                  <p className="text-xs text-muted-foreground">
                    {cert.issuer}
                  </p>

                  <p className="text-xs font-mono text-muted-foreground/50 mt-1">
                    {cert.year}
                  </p>

                  {cert.status && (
                    <p className="mt-2 text-xs font-medium text-primary">
                      {getStatusLabel(cert.status, site.pages.about.certifications.status)}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {philosophy.length > 0 && (
        <section
          className="section bg-gradient-to-b from-card/50 to-background"
          aria-labelledby="philosophy-title"
        >
          <div className="container-wide">
            <div className="max-w-3xl mx-auto text-center">
              <h2
                id="philosophy-title"
                className="heading-section text-display-md mb-6"
              >
                {philosophy[0].title}
              </h2>

              <div className="space-y-6 text-lg text-muted-foreground text-balance">
                <p>{philosophy[0].body}</p>

                {philosophy.slice(1).map((item) => (
                  <p key={item.title}>
                    <strong>{item.title}</strong> — {item.body}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
