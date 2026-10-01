import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { contentLocale, defaultLocale, type Locale } from '@/i18n/config';

export function contentRoot(): string {
  const candidates = [
    path.join(process.cwd(), 'frontend', 'content'),
    path.join(process.cwd(), 'content'),
  ];
  return candidates.find((dir) => fs.existsSync(dir)) ?? candidates[0];
}

function localeDir(locale: Locale, ...segments: string[]): string {
  return path.join(contentRoot(), contentLocale[locale], ...segments);
}

/**
 * Resolve um arquivo/diretório de conteúdo no idioma pedido.
 * Se o arquivo não existir nesse idioma, cai para o conteúdo padrão (pt-BR)
 * e sinaliza `untranslated` (exibido como aviso na página).
 */
export function resolveContentPath(
  locale: Locale,
  ...segments: string[]
): { dir: string; untranslated: boolean } {
  const preferred = localeDir(locale, ...segments);
  if (fs.existsSync(preferred)) return { dir: preferred, untranslated: false };

  const fallback = localeDir(defaultLocale, ...segments);
  if (locale !== defaultLocale && fs.existsSync(fallback)) {
    return { dir: fallback, untranslated: true };
  }

  return { dir: preferred, untranslated: false };
}

export function contentDir(locale: Locale, ...segments: string[]): string {
  return resolveContentPath(locale, ...segments).dir;
}

export interface MdxDocument<T> {
  frontmatter: T;
  content: string;
  /** `true` quando o conteúdo veio do idioma padrão por falta de tradução. */
  untranslated: boolean;
}

export function readMdx<T = Record<string, unknown>>(
  locale: Locale,
  ...segments: string[]
): MdxDocument<T> | null {
  const { dir, untranslated } = resolveContentPath(locale, ...segments);
  if (!fs.existsSync(dir)) return null;
  const fileContents = fs.readFileSync(dir, 'utf8');
  const { data, content } = matter(fileContents);
  return { frontmatter: data as T, content, untranslated };
}
