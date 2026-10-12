import { getAllWriteups } from '@/lib/writeups';
import { buildRssFeed } from '@/lib/rss';
import { defaultLocale, getSite, siteUrl } from '@/i18n';

export const dynamic = 'force-static';

/**
 * Feed RSS dos writeups (`/rss.xml`), gerado em tempo de build a partir do
 * conteúdo MDX do idioma padrão. Artigos em inglês ficam no site (/en/...).
 */
export function GET() {
  const locale = defaultLocale;
  const site = getSite(locale);
  const xml = buildRssFeed({
    locale,
    siteName: `${site.brand.fullName} — ${site.brand.tagline}`,
    description: site.seo.writeups.description,
    writeups: getAllWriteups(locale),
    feedUrl: `${siteUrl()}/rss.xml`,
    siteLink: new URL(`/${locale}`, siteUrl()).toString(),
  });

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
