import '@/styles/tokens.css';
import '@/styles/globals.css';

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SiteLayout } from '@/layouts/site-layout';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ToastProvider, ToastViewport } from '@/components/ui/toast';
import { ThemeProvider } from 'next-themes';
import {
  I18nProvider,
  ScrollRestorer,
  defaultLocale,
  getSite,
  htmlLang,
  isLocale,
  locales,
  pageMetadata,
  siteUrl,
  type Locale,
} from '@/i18n';

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

export default function RootLayout({
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
    <html lang={htmlLang[locale]}>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <I18nProvider locale={locale} site={site}>
            <TooltipProvider>
              <ToastProvider>
                <SiteLayout site={site}>
                  {children}
                </SiteLayout>
                <ToastViewport />
              </ToastProvider>
            </TooltipProvider>
            <ScrollRestorer />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
