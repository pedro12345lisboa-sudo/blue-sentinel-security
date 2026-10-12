import type { Locale } from './config';
import { defaultLocale } from './config';
import { applyPersonalOverrides } from '@/lib/personal';
import ptBR from '../../messages/pt-BR.json';
import en from '../../messages/en.json';

/**
 * Fonte única de textos de UI por idioma.
 *
 * A tipagem deriva de `pt-BR.json`; a atribuição `Record<Locale, Messages>`
 * faz o TypeScript validar o `en.json` contra o mesmo shape em `type-check`.
 * A paridade de chaves também é validada por `scripts/development/check_i18n.mjs`.
 *
 * Os dados pessoais (nome, e-mail, LinkedIn, GitHub) vêm de `NEXT_PUBLIC_*`
 * via `applyPersonalOverrides`; sem `.env`, os placeholders do JSON permanecem.
 */
export type Messages = typeof ptBR;

const messages: Record<Locale, Messages> = {
  'pt-BR': ptBR,
  en,
};

export type Site = Messages;

const resolved: Record<Locale, Messages> = {
  'pt-BR': applyPersonalOverrides(messages['pt-BR']),
  en: applyPersonalOverrides(messages.en),
};

export function getMessages(locale: Locale): Messages {
  return resolved[locale] ?? resolved[defaultLocale];
}

/** O dicionário da página é a raiz das mensagens (API `site.*` preservada). */
export const getSite = getMessages;
