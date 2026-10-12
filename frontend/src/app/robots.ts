import type { MetadataRoute } from 'next';
import { siteUrl } from '@/i18n';

/**
 * robots.txt: indexa o site inteiro e bloqueia o que não é conteúdo público
 * (API, área administrativa e páginas de erro). O sitemap e o feed RSS ficam
 * sempre declarados abaixo.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/admin', '/en/admin', '/pt-BR/admin'],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
