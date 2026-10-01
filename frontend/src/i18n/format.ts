import { intlLocale, type Locale } from './config';

const cache = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat | Intl.RelativeTimeFormat>();

function formatter<T extends Intl.DateTimeFormat | Intl.NumberFormat | Intl.RelativeTimeFormat>(
  key: string,
  create: () => T
): T {
  const existing = cache.get(key);
  if (existing) return existing as T;
  const created = create();
  cache.set(key, created);
  return created;
}

export type DateStyle = 'short' | 'medium' | 'long' | 'full';

/** Datas por idioma via `Intl.DateTimeFormat` (`pt-BR` → 15 de janeiro de 2024). */
export function formatDate(
  date: string | number | Date,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' }
): string {
  const value = toDate(date);
  if (Number.isNaN(value.getTime())) return '';
  return formatter(
    `d:${locale}:${JSON.stringify(options)}`,
    () => new Intl.DateTimeFormat(intlLocale[locale], options)
  ).format(value);
}

export function formatDateTime(date: string | number | Date, locale: Locale): string {
  return formatDate(date, locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(date: string | number | Date, locale: Locale): string {
  return formatDate(date, locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Números/contagens por idioma via `Intl.NumberFormat`. */
export function formatNumber(
  value: number,
  locale: Locale,
  options: Intl.NumberFormatOptions = {}
): string {
  return formatter(
    `n:${locale}:${JSON.stringify(options)}`,
    () => new Intl.NumberFormat(intlLocale[locale], options)
  ).format(value);
}

export function formatPercent(value: number, locale: Locale, fractionDigits = 0): string {
  return formatNumber(value / 100, locale, {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

/**
 * Tempo relativo por idioma via `Intl.RelativeTimeFormat`
 * (pt-BR → "hoje", "ontem", "há 3 dias"; en → "today", "yesterday", "3 days ago").
 */
export function formatRelativeTime(date: string | number | Date, locale: Locale, now: Date = new Date()): string {
  const value = toDate(date);
  if (Number.isNaN(value.getTime())) return '';
  const diffMs = value.getTime() - now.getTime();
  const minutes = Math.round(diffMs / 60_000);
  const days = Math.round(diffMs / 86_400_000);

  const rtf = formatter(
    `r:${locale}`,
    () => new Intl.RelativeTimeFormat(intlLocale[locale], { numeric: 'auto' })
  ) as Intl.RelativeTimeFormat;

  const absMinutes = Math.abs(minutes);
  if (absMinutes < 1) return rtf.format(0, 'minute');
  if (absMinutes < 60) return rtf.format(minutes, 'minute');
  if (Math.abs(days) < 1) return rtf.format(Math.round(minutes / 60), 'hour');
  if (Math.abs(days) < 7) return rtf.format(days, 'day');
  if (Math.abs(days) < 30) return rtf.format(Math.round(days / 7), 'week');
  if (Math.abs(days) < 365) return rtf.format(Math.round(days / 30), 'month');
  return rtf.format(Math.round(days / 365), 'year');
}

/** Tempo de leitura formatado: `5 min de leitura` / `5 min read`. */
export function formatReadingTime(minutes: number, locale: Locale, label: string): string {
  return `${formatNumber(minutes, locale)} ${label}`;
}

function toDate(value: string | number | Date): Date {
  return value instanceof Date ? value : new Date(value);
}
