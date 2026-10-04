'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  localeShort,
  locales,
  saveScrollPosition,
  useLocalizedPathname,
  useSite,
  withLocale,
  type Locale,
} from '@/i18n';

interface LocaleSwitcherProps {
  className?: string;
}

/**
 * Seletor de idioma acessível:
 * - links reais → operáveis por teclado (Tab + Enter), sem JS obrigatório;
 * - `aria-label` por idioma ("Ver este site em English") + `aria-current`;
 * - `lang`/`hreflang` em cada item para leitores de tela trocarem de voz;
 * - preserva a página atual (mesmo caminho), o hash da seção e o scroll
 *   (`saveScrollPosition` + `ScrollRestorer` no layout).
 */
export function LocaleSwitcher({ className }: LocaleSwitcherProps) {
  const site = useSite();
  const { path, locale } = useLocalizedPathname();
  const [hash, setHash] = React.useState('');

  React.useEffect(() => {
    setHash(window.location.hash);
  }, [path]);

  const handleSwitch = () => {
    saveScrollPosition(path);
  };

  return (
    <nav aria-label={site.i18n.languageSelector} className={cn('flex items-center', className)}>
      <ul className="flex items-center gap-1">
        {locales.map((target: Locale) => {
          const active = target === locale;
          return (
            <li key={target}>
              <Link
                href={`${withLocale(path, target)}${hash}`}
                lang={target}
                hrefLang={target}
                aria-label={site.i18n.switchTo[target]}
                aria-current={active ? 'true' : undefined}
                onClick={handleSwitch}
                scroll={false}
                className={cn(
                  'inline-flex h-8 items-center rounded-md border px-2 font-mono text-xs transition-colors',
                  active
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                )}
              >
                <span aria-hidden="true">{localeShort[target]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
