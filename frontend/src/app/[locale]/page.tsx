import { Metadata } from 'next';
import { Hero } from '@/components/sections/hero';
import { Skills } from '@/components/sections/skills';
import { FeaturedProjects } from '@/components/sections/featured-projects';
import { LabTeaser } from '@/components/sections/lab-teaser';
import { Counters } from '@/components/sections/counters';
import { CTA } from '@/components/sections/cta';
import { getAllProjects } from '@/lib/projects';
import { getSite, pageMetadata, type Locale } from '@/i18n';

interface HomeProps {
  params: { locale: Locale };
}

export async function generateMetadata({ params }: HomeProps): Promise<Metadata> {
  const site = getSite(params.locale);
  return pageMetadata(params.locale, {
    title: site.seo.home.title,
    description: site.seo.home.description,
    path: '/',
  });
}

export default function HomePage({ params }: HomeProps) {
  const projects = getAllProjects(params.locale)
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
