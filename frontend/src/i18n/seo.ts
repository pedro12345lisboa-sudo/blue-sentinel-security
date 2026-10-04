import type { Metadata } from 'next';
import { defaultLocale, htmlLang, ogLocale, siteUrl, type Locale, locales } from './config';
import { withLocale } from './path';

export interface PageSeo {
  title: string;
  description?: string;
  /** Caminho interno SEM prefixo de idioma (`/`, `/projects`, `/projects/[slug]`). */
  path: string;
  type?: 'website' | 'article';
  image?: string;
}

function absolute(path: string, locale: Locale): string {
  return new URL(withLocale(path, locale), siteUrl()).toString();
}

/**
 * Metadata por página com SEO localizado:
 * canonical, `hreflang` (alternates.languages), Open Graph com
 * `locale`/`og:locale:alternate` e Twitter card.
 */
export function pageMetadata(locale: Locale, page: PageSeo): Metadata {
  const { title, description, path, type = 'website', image } = page;
  const url = absolute(path, locale);
  const languages: Record<string, string> = {
    'pt-BR': absolute(path, 'pt-BR'),
    en: absolute(path, 'en'),
    'x-default': absolute(path, defaultLocale),
  };

  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: 'Blue-Sentinel',
      locale: ogLocale[locale],
      alternateLocale: locales.filter((l) => l !== locale).map((l) => ogLocale[l]),
      type,
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

/** `<html lang>` do idioma ativo. */
export function langAttribute(locale: Locale): string {
  return htmlLang[locale];
}
