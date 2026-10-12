import { ImageResponse } from 'next/og';
import { OgFrame } from '@/components/seo/og-frame';
import { ogFonts } from '@/components/seo/og-font';
import { getWriteupBySlug } from '@/lib/writeups';
import { getSite, isLocale, defaultLocale, type Locale } from '@/i18n';

export const alt = 'Artigo Blue-Sentinel';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const runtime = 'nodejs';

/**
 * OG image de cada writeup. Artigos com `cover` no frontmatter usam a capa
 * desenhada (via metadata `openGraph.images`); esta rota cobre o restante e
 * serve de fallback com título + descrição.
 */
export default async function OpengraphImage({
  params,
}: {
  params: { locale: string; slug: string };
}) {
  const locale: Locale = isLocale(params.locale) ? params.locale : defaultLocale;
  const site = getSite(locale);
  const writeup = getWriteupBySlug(locale, params.slug);

  if (!writeup) {
    return new Response('Not found', { status: 404 });
  }

  const { title, description, tags } = writeup.frontmatter;

  return new ImageResponse(
    (
      <OgFrame
        eyebrow={locale === 'en' ? 'Article' : 'Artigo'}
        title={title}
        subtitle={description}
        footer={tags.slice(0, 3).join(' · ') || site.brand.name}
      />
    ),
    { ...size, fonts: ogFonts() }
  );
}
