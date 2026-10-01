/**
 * Configuração central de i18n.
 *
 * Justificativa da solução (em vez de next-intl / next-i18next):
 * - `next-i18next` (removido do package.json) é feito para Pages Router e não
 *   funciona no App Router.
 * - `next-intl` funciona no App Router, mas o modelo `t('chave')` encaixa mal
 *   aqui: o dicionário do Blue-Sentinel é um objeto profundo com listas de
 *   objetos (nav.items, security.measures, threats...) que os componentes já
 *   consomem como dados tipados, não como strings interpoladas.
 * - Portanto usamos uma solução equivalente e idiomática para App Router:
 *   segmento de rota `[locale]`, middleware de negociação de idioma, mensagens
 *   em JSON por idioma (`frontend/messages/*.json`), provider React para
 *   componentes client, loader server-side para páginas/metadata, helpers de
 *   rota com prefixo de idioma e formatação via Intl.*. Tudo tipado em
 *   compile-time a partir de `pt-BR.json` (o `en.json` é checado contra esse
 *   shape pelo TypeScript e pelo `scripts/development/check_i18n.mjs`).
 */
export const locales = ['pt-BR', 'en'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'pt-BR';

export const localeNames: Record<Locale, string> = {
  'pt-BR': 'Português (Brasil)',
  en: 'English',
};

/** Valor do atributo `<html lang>`. */
export const htmlLang: Record<Locale, string> = {
  'pt-BR': 'pt-BR',
  en: 'en',
};

/** Locale usado pelo `Intl.*`. */
export const intlLocale: Record<Locale, string> = {
  'pt-BR': 'pt-BR',
  en: 'en',
};

/** Valor usado em `og:locale` (formato com underscore). */
export const ogLocale: Record<Locale, string> = {
  'pt-BR': 'pt_BR',
  en: 'en_US',
};

/** Rótulo curto exibido no seletor de idioma (PT, EN). */
export const localeShort: Record<Locale, string> = {
  'pt-BR': 'PT',
  en: 'EN',
};

/** Locale do diretório de conteúdo MDX em `frontend/content/`. */
export const contentLocale: Record<Locale, string> = {
  'pt-BR': 'pt',
  en: 'en',
};

/** Idioma padrão do conteúdo MDX (usado no fallback de tradução). */
export const fallbackContentLocale = contentLocale[defaultLocale];

/** Cookie que registra a escolha explícita do usuário. */
export const localeCookie = 'BLUE_SENTINEL_LOCALE';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

/** URL base canônica para metadata/sitemap/hreflang. */
export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || 'https://blue-sentinel.local';
}

/**
 * Negocia o idioma a partir do header `Accept-Language`.
 * Ordem: pt* → pt-BR, en* → en, senão o padrão.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return defaultLocale;

  const parsed = acceptLanguage
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith('q='));
      const quality = q ? Number.parseFloat(q.slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), quality: Number.isFinite(quality) ? quality : 0 };
    })
    .filter((entry) => entry.tag && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of parsed) {
    if (tag === '*') return defaultLocale;
    const primary = tag.split('-')[0];
    if (primary === 'pt') return 'pt-BR';
    if (primary === 'en') return 'en';
  }

  return defaultLocale;
}
