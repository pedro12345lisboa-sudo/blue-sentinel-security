import type { MetadataRoute } from 'next';
import { getAllProjects } from '@/lib/projects';
import { getAllWriteups } from '@/lib/writeups';
import { defaultLocale, siteUrl, withLocale, type Locale } from '@/i18n';

function absolute(path: string, locale: Locale): string {
  return new URL(withLocale(path, locale), siteUrl()).toString();
}

function entry(path: string, priority: number, changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']) {
  return {
    url: absolute(path, defaultLocale),
    lastModified: new Date(),
    changeFrequency,
    priority,
    alternates: {
      languages: {
        'pt-BR': absolute(path, 'pt-BR'),
        en: absolute(path, 'en'),
        'x-default': absolute(path, defaultLocale),
      },
    },
  };
}

/**
 * Sitemap com as duas versões de cada URL e `xhtml:link hreflang`
 * (via `alternates.languages` do Metadata Route).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    { path: '/', priority: 1, changeFrequency: 'weekly' as const },
    { path: '/about', priority: 0.8, changeFrequency: 'monthly' as const },
    { path: '/projects', priority: 0.9, changeFrequency: 'weekly' as const },
    { path: '/writeups', priority: 0.8, changeFrequency: 'weekly' as const },
    { path: '/lab', priority: 0.7, changeFrequency: 'monthly' as const },
    { path: '/status', priority: 0.5, changeFrequency: 'daily' as const },
    { path: '/security', priority: 0.6, changeFrequency: 'monthly' as const },
    { path: '/resume', priority: 0.6, changeFrequency: 'monthly' as const },
    { path: '/faq', priority: 0.5, changeFrequency: 'monthly' as const },
    { path: '/contact', priority: 0.6, changeFrequency: 'monthly' as const },
  ].map(({ path, priority, changeFrequency }) => entry(path, priority, changeFrequency));

  const projectLinks = getAllProjects(defaultLocale).map((project) =>
    entry(`/projects/${project.slug}`, 0.7, 'monthly')
  );
  const writeupLinks = getAllWriteups(defaultLocale).map((writeup) =>
    entry(`/writeups/${writeup.slug}`, 0.6, 'monthly')
  );

  return [...paths, ...projectLinks, ...writeupLinks];
}
