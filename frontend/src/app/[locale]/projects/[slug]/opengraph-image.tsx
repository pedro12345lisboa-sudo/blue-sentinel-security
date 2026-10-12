import { ImageResponse } from 'next/og';
import { OgFrame } from '@/components/seo/og-frame';
import { ogFonts } from '@/components/seo/og-font';
import { getProjectBySlug } from '@/lib/projects';
import { getSite, isLocale, defaultLocale, type Locale } from '@/i18n';

export const alt = 'Projeto Blue-Sentinel';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const runtime = 'nodejs';

/** OG image de cada projeto (case study), gerada a partir do frontmatter MDX. */
export default async function OpengraphImage({
  params,
}: {
  params: { locale: string; slug: string };
}) {
  const locale: Locale = isLocale(params.locale) ? params.locale : defaultLocale;
  const site = getSite(locale);
  const project = getProjectBySlug(locale, params.slug);

  if (!project) {
    return new Response('Not found', { status: 404 });
  }

  const { title, description, tags } = project.frontmatter;

  return new ImageResponse(
    (
      <OgFrame
        eyebrow={locale === 'en' ? 'Project' : 'Projeto'}
        title={title}
        subtitle={description}
        footer={tags.slice(0, 3).join(' · ') || site.brand.name}
      />
    ),
    { ...size, fonts: ogFonts() }
  );
}
