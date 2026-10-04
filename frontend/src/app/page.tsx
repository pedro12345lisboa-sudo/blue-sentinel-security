import { Hero } from '@/components/sections/hero';
import { Skills } from '@/components/sections/skills';
import { FeaturedProjects } from '@/components/sections/featured-projects';
import { LabTeaser } from '@/components/sections/lab-teaser';
import { Counters } from '@/components/sections/counters';
import { CTA } from '@/components/sections/cta';
import { getAllProjects } from '@/lib/projects';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cybersecurity Portfolio | Blue Team & Detection Engineering',
  description: 'Blue Team engineer portfolio: detection engineering, threat hunting, security automation, and interactive detection lab.',
  openGraph: {
    title: 'Blue-Sentinel | Cybersecurity Portfolio',
    description: 'Blue Team / SOC portfolio showcasing detection engineering and security automation',
    type: 'website',
  },
};

export default function HomePage() {
  const projects = getAllProjects()
    .filter((project) => project.highlight)
    .slice(0, 6)
    .map((project) => ({
      slug: project.slug,
      title: project.title,
      description: project.description,
      tags: project.tags,
      icon: project.icon,
      highlight: project.highlight,
      links: project.links,
    }));

  return (
    <>
      <Hero />
      <Skills />
      <FeaturedProjects projects={projects} />
      <LabTeaser />
      <Counters />
      <CTA />
    </>
  );
}