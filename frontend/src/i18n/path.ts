import { defaultLocale, isLocale, locales, type Locale } from './config';

const PREFIXED = /^\/(pt-BR|en)(?=\/|$)/;

/** `true` quando o caminho já começa com o prefixo de um idioma suportado. */
export function hasLocalePrefix(pathname: string): boolean {
  return PREFIXED.test(pathname);
}

/** Separa um caminho no segmento de idioma. `/en/projects` → `{ locale: 'en', path: '/projects' }`. */
export function splitLocale(pathname: string): { locale: Locale | null; path: string } {
  const match = PREFIXED.exec(pathname);
  if (!match) return { locale: null, path: pathname || '/' };
  const locale = match[1] as Locale;
  const rest = pathname.slice(match[0].length) || '/';
  return { locale, path: rest.startsWith('/') ? rest : `/${rest}` };
}

/** Idioma do caminho, ou `null` se não houver prefixo. */
export function localeFromPathname(pathname: string): Locale | null {
  return splitLocale(pathname).locale;
}

/** Caminho sem o prefixo de idioma (`/pt-BR/projects` → `/projects`). */
export function stripLocale(pathname: string): string {
  return splitLocale(pathname).path;
}

/**
 * Adiciona/troca o prefixo de idioma em um caminho interno.
 * URLs absolutas, `mailto:` e `#hash` isolados são devolvidas intactas.
 */
export function withLocale(path: string, locale: Locale): string {
  if (!path) return path;
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//')) return path;
  if (path.startsWith('#')) return path;

  const [pathnameAndQuery, hash = ''] = splitHash(path);
  const { path: clean } = splitLocale(pathnameAndQuery);
  const base = clean === '/' ? '' : clean;
  const prefixed = `/${locale}${base}` || `/${locale}`;
  return `${prefixed}${hash}`;
}

function splitHash(path: string): [string, string] {
  const index = path.indexOf('#');
  if (index === -1) return [path, ''];
  return [path.slice(0, index), path.slice(index)];
}

/** Preserva a escolha de idioma entre navegações. */
export function localeFromCookie(cookieValue: string | undefined | null): Locale | null {
  return isLocale(cookieValue) ? cookieValue : null;
}

export function isSupportedLocale(value: string | undefined): value is Locale {
  return isLocale(value);
}

export { defaultLocale, locales };
