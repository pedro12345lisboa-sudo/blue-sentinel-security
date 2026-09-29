'use client';

import { useEffect, useRef } from 'react';
import {
  Shield,
  GraduationCap,
  Award,
  Code,
  Zap,
  Terminal,
} from 'lucide-react';
import { gsap } from 'gsap';
import { useReducedMotion, useInView } from '@/hooks';

const timeline = [
  {
    year: '2024',
    title: 'Senior Detection Engineer',
    company: 'Enterprise SOC',
    description:
      'Leading detection engineering team. Designed and deployed 200+ Sigma rules, reduced false positives by 73%, built automated threat hunting framework.',
    icon: Shield,
    tags: ['Sigma', 'MITRE ATT&CK', 'Splunk', 'Elastic', 'Python', 'SOAR'],
  },
  {
    year: '2022',
    title: 'Security Engineer',
    company: 'FinTech Startup',
    description:
      'Built security automation pipelines, implemented eBPF-based monitoring, developed custom C++ agent for endpoint telemetry.',
    icon: Code,
    tags: ['C++', 'eBPF', 'Go', 'Kubernetes', 'AWS', 'Terraform'],
  },
  {
    year: '2020',
    title: 'SOC Analyst L2/L3',
    company: 'MSSP',
    description:
      'Incident response, threat hunting, malware analysis. Created detection rules for APT campaigns, mentored junior analysts.',
    icon: Terminal,
    tags: [
      'Splunk',
      'CrowdStrike',
      'MITRE ATT&CK',
      'YARA',
      'Volatility',
    ],
  },
  {
    year: '2018',
    title: 'B.Sc. Computer Science',
    company: 'University',
    description:
      'Focus on systems programming, network security, and cryptography. Thesis: "Behavioral Analysis of Fileless Malware using eBPF".',
    icon: GraduationCap,
    tags: [
      'C',
      'Assembly',
      'Network Security',
      'Cryptography',
      'eBPF',
    ],
  },
];

const certifications = [
  { name: 'GCIA', issuer: 'GIAC', year: '2023', icon: Award },
  { name: 'GCFA', issuer: 'GIAC', year: '2022', icon: Award },
  { name: 'GCIH', issuer: 'GIAC', year: '2021', icon: Award },
  { name: 'Security+', issuer: 'CompTIA', year: '2019', icon: Award },
  { name: 'CySA+', issuer: 'CompTIA', year: '2020', icon: Award },
  { name: 'eJPT', issuer: 'INE', year: '2019', icon: Award },
];

const focusAreas = [
  {
    title: 'Detection Engineering',
    description:
      'Sigma/YARA rule development, MITRE ATT&CK mapping, alert tuning, false positive reduction',
    icon: Zap,
  },
  {
    title: 'Threat Hunting',
    description:
      'Hypothesis-driven hunts, behavioral analytics, ATT&CK coverage assessment, purple teaming',
    icon: Shield,
  },
  {
    title: 'Security Automation',
    description:
      'SOAR playbooks, CI/CD security gates, API integrations, workflow orchestration',
    icon: Code,
  },
  {
    title: 'Systems Programming',
    description:
      'C++20, eBPF, kernel modules, memory forensics, network programming',
    icon: Terminal,
  },
];

function AboutPage() {
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
    }, sectionRef.current);

    return () => ctx.revert();
  }, [reducedMotion, isInView]);

  return (
    <>
      {/* HERO */}
      <section
        className="section relative overflow-hidden"
        aria-labelledby="about-hero-title"
      >
        <div
          className="absolute inset-0 gradient-mesh"
          aria-hidden="true"
        />

        <div
          className="absolute inset-0 noise-overlay"
          aria-hidden="true"
        />

        <div className="container-wide relative">
          <div className="max-w-3xl">
            <h1
              id="about-hero-title"
              className="mb-6 text-display-lg font-display font-bold tracking-tight"
            >
              <span className="font-mono text-primary">
                blue-sentinel
              </span>{' '}
              — About
            </h1>

            <p className="text-lg text-muted-foreground text-balance">
              Blue Team engineer with 6+ years of experience in SOC
              operations, detection engineering, and security automation.
              Passionate about building defensive tooling that scales and
              sharing knowledge through open-source contributions.
            </p>
          </div>
        </div>
      </section>

      {/* FOCUS AREAS */}
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
              Focus Areas
            </h2>

            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Technical domains where I invest most of my time and energy.
            </p>
          </div>

          <div
            ref={ref}
            className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
          >
            {focusAreas.map((area) => (
              <article
                key={area.title}
                className="focus-card group relative rounded-2xl border border-border/50 bg-card/50 p-6 transition-all duration-300 hover:border-primary/30 hover:shadow-glow hover:bg-card"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <area.icon
                    className="h-6 w-6"
                    aria-hidden="true"
                  />
                </div>

                <h3 className="mb-3 text-lg font-semibold text-foreground">
                  {area.title}
                </h3>

                <p className="text-sm text-muted-foreground">
                  {area.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* EXPERIENCE */}
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
              Experience & Studies
            </h2>

            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Professional journey from SOC analyst to detection
              engineering lead.
            </p>
          </div>

          <div className="relative">
            <div
              className="absolute left-8 top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary/50 via-primary to-transparent"
              aria-hidden="true"
            />

            <div className="space-y-12" role="list">
              {timeline.map((item) => (
                <article
                  key={item.year}
                  className="timeline-item relative pl-20 group"
                  role="listitem"
                >
                  <div className="absolute left-0 top-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary border-4 border-background z-10">
                    <item.icon
                      className="h-6 w-6 text-primary"
                      aria-hidden="true"
                    />
                  </div>

                  <div className="mb-2 flex items-center gap-3">
                    <span className="text-sm font-mono text-primary font-semibold">
                      {item.year}
                    </span>

                    <h3 className="text-lg font-semibold text-foreground">
                      {item.title}
                    </h3>

                    <span className="px-2 py-0.5 text-xs font-mono bg-secondary text-muted-foreground rounded">
                      {item.company}
                    </span>
                  </div>

                  <p className="mb-3 text-muted-foreground">
                    {item.description}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-1 text-xs font-mono bg-secondary/50 text-muted-foreground rounded border border-border/50"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CERTIFICATIONS */}
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
              Certifications
            </h2>

            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Industry-recognized credentials validating expertise in
              intrusion analysis, forensics, and incident handling.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            {certifications.map((cert) => (
              <article
                key={cert.name}
                className="cert-card group relative rounded-xl border border-border/50 bg-card/50 p-5 text-center transition-all duration-300 hover:border-primary/30 hover:shadow-glow hover:bg-card"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mx-auto">
                  <cert.icon
                    className="h-5 w-5"
                    aria-hidden="true"
                  />
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
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* SECURITY PHILOSOPHY */}
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
              Security Philosophy
            </h2>

            <div className="space-y-6 text-lg text-muted-foreground text-balance">
              <p>
                <strong>Defense in depth</strong> isn't a buzzword — it's
                the only sustainable strategy. I build detection logic that
                assumes breach and focuses on minimizing dwell time through
                high-fidelity alerts and automated enrichment.
              </p>

              <p>
                <strong>Automation</strong> should amplify human analysis,
                not replace it. Every playbook I write has a human decision
                point. The goal is to reduce toil, not to create black
                boxes.
              </p>

              <p>
                <strong>Open knowledge</strong> makes us all stronger. I
                publish detection rules, hunting queries, and tooling
                openly. The community improves faster when we share what
                works (and what doesn't).
              </p>

              <p>
                <strong>Continuous learning</strong> is non-negotiable. The
                threat landscape evolves daily. I dedicate time weekly to
                reading threat reports, testing new techniques, and
                contributing to open-source security projects.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export default AboutPage;