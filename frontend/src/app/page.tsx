import { Hero } from '@/components/sections/hero';
import { Skills } from '@/components/sections/skills';
import { FeaturedProjects } from '@/components/sections/featured-projects';
import { LabTeaser } from '@/components/sections/lab-teaser';
import { Counters } from '@/components/sections/counters';
import { CTA } from '@/components/sections/cta';
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
  return (
    <>
      <Hero />
      <Skills />
      <FeaturedProjects />
      <LabTeaser />
      <Counters />
      <CTA />
    </>
  );
}