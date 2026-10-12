import { ImageResponse } from 'next/og';
import { OgFrame } from '@/components/seo/og-frame';
import { ogFonts } from '@/components/seo/og-font';
import { getSite, isLocale, defaultLocale, type Locale } from '@/i18n';

export const alt = 'Blue-Sentinel — portfólio de Cybersecurity Blue Team';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const runtime = 'nodejs';

/** OG image padrão: usada por todas as páginas que não definem a própria. */
export default async function OpengraphImage({ params }: { params: { locale: string } }) {
  const locale: Locale = isLocale(params.locale) ? params.locale : defaultLocale;
  const site = getSite(locale);

  return new ImageResponse(
    (
      <OgFrame
        eyebrow={locale === 'en' ? 'Cybersecurity Portfolio' : 'Portfólio de Cybersecurity'}
        title={site.seo.home.ogTitle || site.seo.home.title}
        subtitle={site.seo.home.ogDescription || site.seo.home.description}
        footer={site.brand.tagline}
      />
    ),
    { ...size, fonts: ogFonts() }
  );
}
