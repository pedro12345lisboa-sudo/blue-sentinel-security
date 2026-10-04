'use client';

import { usePathname } from 'next/navigation';
import { defaultLocale } from '@/i18n/config';
import { localeFromPathname } from '@/i18n/path';
import { getMessages } from '@/i18n/messages';
import { I18nProvider } from '@/i18n/context';
import { SiteLayout } from '@/layouts/site-layout';
import { NotFoundView } from '@/components/not-found-view';

/**
 * 404 raiz: rotas sem correspondência caem aqui (o `not-found` do segmento
 * `[locale]` só atende `notFound()` dentro das rotas localizadas). O idioma é
 * lido da URL para que o texto e os links continuem no idioma escolhido.
 */
export default function NotFound() {
  const pathname = usePathname() ?? '/';
  const locale = localeFromPathname(pathname) ?? defaultLocale;
  const site = getMessages(locale);

  return (
    <I18nProvider locale={locale} site={site}>
      <SiteLayout site={site}>
        <NotFoundView site={site} />
      </SiteLayout>
    </I18nProvider>
  );
}
