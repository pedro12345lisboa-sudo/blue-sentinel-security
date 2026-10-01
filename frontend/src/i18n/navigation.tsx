'use client';

import * as React from 'react';
import Link, { type LinkProps } from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from './context';
import { localeFromPathname, stripLocale, withLocale } from './path';

type Href = LinkProps['href'];

function localizeHref(href: Href, locale: ReturnType<typeof useLocale>): Href {
  if (typeof href !== 'string') {
    if (href && typeof href === 'object' && typeof href.pathname === 'string') {
      return { ...href, pathname: withLocale(href.pathname, locale) };
    }
    return href;
  }
  return withLocale(href, locale);
}

/**
 * `next/link` que aponta para a mesma página no idioma ativo.
 * URLs externas (`mailto:`, `https://...`) passam intactas.
 */
type LocalizedLinkProps = Omit<React.ComponentProps<typeof Link>, 'href'> & {
  href: Href;
};

export function LocalizedLink({ href, children, ...rest }: LocalizedLinkProps) {
  const locale = useLocale();
  return (
    <Link href={localizeHref(href, locale)} {...rest}>
      {children}
    </Link>
  );
}

export interface LocalizedPathname {
  /** Idioma ativo (lido do prefixo da URL, com fallback no provider). */
  locale: ReturnType<typeof useLocale>;
  /** Caminho sem o prefixo de idioma (`/pt-BR/projects` → `/projects`). */
  path: string;
  /** Caminho completo com prefixo. */
  pathname: string;
}

/**
 * Caminho atual "limpo": permite comparar rotas (`/projects`) independentemente
 * do idioma, mantendo a mesma página ao trocar de idioma.
 */
export function useLocalizedPathname(): LocalizedPathname {
  const ctxLocale = useLocale();
  const pathname = usePathname() || '/';
  const pathLocale = localeFromPathname(pathname);
  return {
    locale: pathLocale ?? ctxLocale,
    path: stripLocale(pathname),
    pathname,
  };
}

/**
 * Guarda a posição de scroll atual para a página (chamado pelo seletor de
 * idioma antes de navegar) e restaura depois da troca quando não há hash.
 */
const scrollKey = (path: string) => `blue-sentinel:scroll:${path}`;

export function saveScrollPosition(path: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(scrollKey(path), String(window.scrollY));
  } catch {
    /* sessionStorage indisponível: a troca de idioma segue sem restauração */
  }
}

export function ScrollRestorer() {
  const { path } = useLocalizedPathname();

  React.useEffect(() => {
    const stored = window.sessionStorage.getItem(scrollKey(path));
    if (stored === null) return;
    window.sessionStorage.removeItem(scrollKey(path));
    if (window.location.hash) return; // o navegador cuida da âncora da seção
    const top = Number(stored);
    if (!Number.isFinite(top) || top <= 0) return;
    requestAnimationFrame(() => {
      window.scrollTo({ top, left: 0, behavior: 'instant' as ScrollBehavior });
    });
  }, [path]);

  return null;
}
