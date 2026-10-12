import { defaultLocale, siteUrl, withLocale, type Locale } from '@/i18n';
import type { ProjectFrontmatter } from '@/lib/projects';
import type { WriteupFrontmatter } from '@/lib/writeups';

/**
 * Construtores de dados estruturados (schema.org) usados pelas páginas.
 *
 * - `Person` + `WebSite`  → Home
 * - `Article`             → writeups
 * - `SoftwareSourceCode`  → detalhe de projetos
 *
 * Todos os valores vêm do dicionário de mensagens (placeholders por padrão,
 * `NEXT_PUBLIC_*` quando presentes); nada de dado pessoal real no repositório.
 */

type Site = ReturnType<typeof import('@/i18n/messages').getMessages>;

function absolute(path: string, locale: Locale): string {
  return new URL(withLocale(path, locale), siteUrl()).toString();
}

export function webSiteJsonLd(site: Site, locale: Locale = defaultLocale) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site.brand.fullName,
    description: site.seo.home.description,
    url: absolute('/', locale),
    inLanguage: locale,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: absolute('/writeups?q={search_term_string}', locale),
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function personJsonLd(site: Site, locale: Locale = defaultLocale) {
  const links = [site.contacts.github, site.contacts.linkedin].filter(
    (url): url is string => Boolean(url) && /^https?:\/\//.test(url)
  );

  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: site.profile.name,
    jobTitle: site.profile.title,
    description: site.profile.summary,
    url: absolute('/', locale),
    email: site.contacts.general?.startsWith('mailto:')
      ? site.contacts.general
      : `mailto:${site.contacts.general}`,
    worksFor: {
      '@type': 'Organization',
      name: site.brand.fullName,
    },
    sameAs: links,
    knowsAbout: ['Blue Team', 'Detection Engineering', 'MITRE ATT&CK', 'Sigma'],
  };
}

export function articleJsonLd(
  site: Site,
  writeup: WriteupFrontmatter,
  locale: Locale,
  content: string
) {
  const canonical = absolute(`/writeups/${writeup.slug}`, locale);
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: writeup.title,
    description: writeup.description,
    ...(writeup.cover ? { image: new URL(writeup.cover, siteUrl()).toString() } : {}),
    datePublished: writeup.date,
    dateModified: writeup.updated ?? writeup.date,
    inLanguage: locale === 'en' ? 'en' : 'pt-BR',
    keywords: writeup.tags.join(', '),
    wordCount: content.split(/\s+/).filter(Boolean).length,
    author: { '@type': 'Person', name: site.brand.fullName, url: absolute('/', locale) },
    publisher: { '@type': 'Organization', name: site.brand.fullName },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
  };
}

export function softwareSourceCodeJsonLd(
  site: Site,
  project: ProjectFrontmatter,
  locale: Locale
) {
  const canonical = absolute(`/projects/${project.slug}`, locale);
  const codeRepository = project.links?.github ?? site.contacts.repository;

  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareSourceCode',
    name: project.title,
    description: project.description,
    url: canonical,
    ...(codeRepository && /^https?:\/\//.test(codeRepository)
      ? { codeRepository }
      : {}),
    programmingLanguage: 'TypeScript',
    runtimePlatform: 'Next.js',
    datePublished: project.date,
    inLanguage: locale === 'en' ? 'en' : 'pt-BR',
    keywords: project.tags.join(', '),
    author: { '@type': 'Person', name: site.brand.fullName, url: absolute('/', locale) },
    license: 'https://spdx.org/licenses/MIT.html',
    isAccessibleForFree: true,
  };
}
