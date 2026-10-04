import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SiteLayout } from '@/layouts/site-layout';
import { I18nProvider, ScrollRestorer, defaultLocale, getSite, isLocale, locales, pageMetadata, siteUrl, type Locale } from '@/i18n';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const locale: Locale = isLocale(params.locale) ? params.locale : defaultLocale;
  const site = getSite(locale);
  return {
    metadataBase: new URL(siteUrl()),
    ...pageMetadata(locale, {
      title: site.seo.home.title,
      description: site.seo.home.description,
      path: '/',
    }),
  };
}

/**
 * Layout das rotas localizadas. O `<html>`/`<body>` e as providers globais
 * (tema, toast, tooltip) vivem no layout raiz (`app/layout.tsx`); aqui ficam
 * só o dicionário do idioma ativo e o chrome do site.
 */
export default function LocaleLayout({
  params,
  children,
}: {
  params: { locale: string };
  children: React.ReactNode;
}) {
  if (!isLocale(params.locale)) notFound();

  const locale = params.locale as Locale;
  const site = getSite(locale);

  return (
    <I18nProvider locale={locale} site={site}>
      <SiteLayout site={site}>{children}</SiteLayout>
      <ScrollRestorer />
    </I18nProvider>
  );
}
