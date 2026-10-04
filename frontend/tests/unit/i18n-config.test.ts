import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  contentLocale,
  defaultLocale,
  htmlLang,
  isLocale,
  localeNames,
  locales,
  negotiateLocale,
  ogLocale,
  siteUrl,
} from '@/i18n/config';

describe('isLocale', () => {
  it('accepts only known locales', () => {
    expect(isLocale('pt-BR')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(42)).toBe(false);
  });
});

describe('negotiateLocale', () => {
  it('defaults to pt-BR without header', () => {
    expect(negotiateLocale(null)).toBe(defaultLocale);
    expect(negotiateLocale(undefined)).toBe(defaultLocale);
    expect(negotiateLocale('')).toBe(defaultLocale);
  });

  it('prefers portuguese variants', () => {
    expect(negotiateLocale('pt-BR,pt;q=0.9,en;q=0.8')).toBe('pt-BR');
    expect(negotiateLocale('pt-PT')).toBe('pt-BR');
  });

  it('accepts english variants', () => {
    expect(negotiateLocale('en-US,en;q=0.9')).toBe('en');
  });

  it('honours quality ordering', () => {
    expect(negotiateLocale('es;q=0.8, en;q=0.5')).toBe('en');
    expect(negotiateLocale('en;q=0, pt;q=0.2')).toBe('pt-BR');
  });

  it('falls back for unsupported languages and wildcards', () => {
    expect(negotiateLocale('fr-FR,fr;q=0.9')).toBe('pt-BR');
    expect(negotiateLocale('*;q=1')).toBe('pt-BR');
    expect(negotiateLocale('garbage')).toBe('pt-BR');
  });
});

describe('siteUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the public env var when set', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://exemplo.test');
    expect(siteUrl()).toBe('https://exemplo.test');
  });

  it('falls back to the canonical host', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    expect(siteUrl()).toBe('https://blue-sentinel.local');
  });
});

describe('locale tables', () => {
  it('keeps every locale mapped in every table', () => {
    for (const locale of locales) {
      expect(localeNames[locale]).toBeTruthy();
      expect(htmlLang[locale]).toBeTruthy();
      expect(ogLocale[locale]).toMatch(/_/);
      expect(contentLocale[locale]).toBeTruthy();
    }
  });
});
