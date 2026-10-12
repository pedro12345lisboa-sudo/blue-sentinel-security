import type { WriteupFrontmatter } from '@/lib/writeups';
import { siteUrl, withLocale, type Locale } from '@/i18n';

/** Escapa entidades XML obrigatórias (o resto já é texto seguro). */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function absolute(path: string, locale: Locale): string {
  return new URL(withLocale(path, locale), siteUrl()).toString();
}

function toRfc822(date: string): string {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime())
    ? new Date(0).toUTCString()
    : parsed.toUTCString();
}

export interface RssFeedInput {
  locale: Locale;
  siteName: string;
  description: string;
  writeups: WriteupFrontmatter[];
  feedUrl: string;
  siteLink: string;
}

/**
 * Gera o feed RSS 2.0 dos writeups do idioma padrão.
 * URLs são absolutas (canônicas com prefixo de idioma) para o leitor
 * conseguir abrir o artigo original.
 */
export function buildRssFeed(input: RssFeedInput): string {
  const { locale, siteName, description, writeups, feedUrl, siteLink } = input;
  const lastBuildDate = writeups[0]?.date
    ? toRfc822(writeups[0].date)
    : new Date(0).toUTCString();

  const items = writeups
    .map((writeup) => {
      const link = absolute(`/writeups/${writeup.slug}`, locale);
      const categories = writeup.tags
        .map((tag) => `      <category>${esc(tag)}</category>`)
        .join('\n');
      const enclosure = writeup.cover
        ? `\n      <enclosure url="${esc(new URL(writeup.cover, siteUrl()).toString())}" type="image/png" length="0"/>`
        : '';

      return `    <item>
      <title>${esc(writeup.title)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="true">${esc(link)}</guid>
      <pubDate>${toRfc822(writeup.date)}</pubDate>
      <description>${esc(writeup.description)}</description>${categories}${enclosure}
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(siteName)}</title>
    <link>${esc(siteLink)}</link>
    <description>${esc(description)}</description>
    <language>${locale === 'en' ? 'en' : 'pt-BR'}</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${esc(feedUrl)}" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;
}
