import { Metadata } from 'next';
import { Hero } from '@/components/sections/hero';
import { Skills } from '@/components/sections/skills';
import { FeaturedProjects } from '@/components/sections/featured-projects';
import { LabTeaser } from '@/components/sections/lab-teaser';
import { Counters } from '@/components/sections/counters';
import { CTA } from '@/components/sections/cta';
import { getAllProjects } from '@/lib/projects';
import { site } from '../../content/site';
export const metadata: Metadata = {
  title: site.seo.home.title,
  description: site.seo.home.description,
  openGraph: {
    title: site.seo.home.ogTitle,
    description: site.seo.home.ogDescription,
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
