import type { Metadata } from 'next';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { readMdx } from '@/lib/content';
import { getSite, pageMetadata, type Locale } from '@/i18n';
import { UntranslatedNotice } from '@/components/common/untranslated-notice';
import { MDXComponents } from '@/components/mdx-components';
import { AboutView } from './about-view';
import type {
  AboutCertification,
  AboutFocusArea,
  AboutPhilosophyItem,
  AboutTimelineItem,
} from './about-view';

interface AboutFrontmatter {
  title?: string;
  seo?: {
    title?: string;
    description?: string;
  };
  hero?: {
    title?: string;
    intro?: string;
  };
  focusAreas?: AboutFocusArea[];
  timeline?: AboutTimelineItem[];
  certifications?: AboutCertification[];
  philosophy?: AboutPhilosophyItem[];
}

interface AboutProps {
  params: { locale: Locale };
}

export function generateMetadata({ params }: AboutProps): Metadata {
  const site = getSite(params.locale);
  const aboutDoc = readMdx<AboutFrontmatter>(params.locale, 'about.mdx');
  return pageMetadata(params.locale, {
    title: aboutDoc?.frontmatter.seo?.title ?? site.seo.about.title,
    description: aboutDoc?.frontmatter.seo?.description ?? site.seo.about.description,
    path: '/about',
  });
}

export default function AboutPage({ params }: AboutProps) {
  const site = getSite(params.locale);
  const aboutDoc = readMdx<AboutFrontmatter>(params.locale, 'about.mdx');
  const frontmatter = aboutDoc?.frontmatter;

  return (
    <>
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
              {frontmatter?.hero?.title ?? site.seo.about.title}
            </h1>

            <p className="text-lg text-muted-foreground text-balance">
              {frontmatter?.hero?.intro ?? site.seo.about.description}
            </p>
          </div>
        </div>
      </section>

      <AboutView
        focusAreas={frontmatter?.focusAreas ?? []}
        timeline={frontmatter?.timeline ?? []}
        certifications={frontmatter?.certifications ?? []}
        philosophy={frontmatter?.philosophy ?? []}
      />

      {aboutDoc && (
        <section
          className="section"
          aria-label={frontmatter?.title ?? site.seo.about.title}
        >
          <div className="container-wide">
            <div className="max-w-3xl space-y-6">
              {aboutDoc.untranslated && <UntranslatedNotice />}
              <MDXRemote
                source={aboutDoc.content}
                components={MDXComponents({ components: {}, site })}
              />
            </div>
          </div>
        </section>
      )}
    </>
  );
}
