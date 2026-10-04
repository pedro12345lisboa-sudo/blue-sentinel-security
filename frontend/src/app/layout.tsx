import '@/styles/tokens.css';
import '@/styles/globals.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ToastProvider, ToastViewport } from '@/components/ui/toast';
import { ThemeProvider } from 'next-themes';
import { HydrationMarker } from '@/components/hydration-marker';
import { defaultLocale, htmlLang, isLocale, localeHeader } from '@/i18n/config';
import { getSite, pageMetadata, siteUrl } from '@/i18n';

/**
 * Layout raiz: dono único de `<html>` e `<body>` (regra do App Router) e das
 * providers globais de tema/toast/tooltip.
 *
 * O `<html lang>` é resolvido a partir do cabeçalho escrito pelo middleware
 * (`x-blue-sentinel-locale`), porque o segmento `[locale]` só existe depois do
 * roteamento e o layout raiz não recebe `params`. Rotas sem o cabeçalho caem no
 * idioma padrão.
 *
 * O chrome do site (header/footer) NÃO fica aqui: cada rota localizada o
 * renderiza no próprio layout com o dicionário do idioma ativo
 * (`app/[locale]/layout.tsx`).
 */
export async function generateMetadata(): Promise<Metadata> {
  const routeLocale = headers().get(localeHeader);
  const locale = isLocale(routeLocale) ? routeLocale : defaultLocale;
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

export default async function RootLayout({ children }: { children: ReactNode }) {
  const routeLocale = headers().get(localeHeader);
  const lang = isLocale(routeLocale) ? htmlLang[routeLocale] : htmlLang[defaultLocale];

  return (
    <html lang={lang} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <HydrationMarker />
          <TooltipProvider>
            <ToastProvider>
              {children}
              <ToastViewport />
            </ToastProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
