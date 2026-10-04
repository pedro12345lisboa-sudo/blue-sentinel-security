'use client';

import * as React from 'react';
import { defaultLocale, htmlLang, type Locale } from './config';
import type { Messages } from './messages';
import fallbackMessages from '../../messages/pt-BR.json';

interface I18nContextValue {
  locale: Locale;
  site: Messages;
}

const I18nContext = React.createContext<I18nContextValue | null>(null);

export function I18nProvider({
  locale,
  site,
  children,
}: {
  locale: Locale;
  site: Messages;
  children: React.ReactNode;
}) {
  const value = React.useMemo(() => ({ locale, site }), [locale, site]);

  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = htmlLang[locale];
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Idioma ativo. Fora do provider (testes isolados, error boundary acima do
 * layout) cai no idioma padrão, nunca em runtime.
 */
export function useLocale(): Locale {
  const ctx = React.useContext(I18nContext);
  return ctx?.locale ?? defaultLocale;
}

/** Dicionário de textos do idioma ativo. */
export function useSite(): Messages {
  const ctx = React.useContext(I18nContext);
  return ctx?.site ?? (fallbackMessages as Messages);
}

export function useI18n(): I18nContextValue {
  const ctx = React.useContext(I18nContext);
  return ctx ?? { locale: defaultLocale, site: fallbackMessages as Messages };
}
