import { afterEach, describe, expect, it, vi } from 'vitest';

import { langAttribute, pageMetadata } from '@/i18n/seo';

describe('pageMetadata', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('builds canonical, hreflang and open graph for a page', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://exemplo.test');

    const metadata = pageMetadata('pt-BR', {
      title: 'Projetos',
      description: 'Cases de detecção.',
      path: '/projects',
    });
    const og = metadata.openGraph as unknown as {
      type?: string;
      locale?: string;
      alternateLocale?: string[];
      images?: unknown;
    };
    const twitter = metadata.twitter as unknown as { card?: string; title?: string };

    expect(metadata.title).toBe('Projetos');
    expect(metadata.description).toBe('Cases de detecção.');
    expect(metadata.alternates?.canonical).toBe('https://exemplo.test/pt-BR/projects');
    expect(metadata.alternates?.languages?.['pt-BR']).toBe('https://exemplo.test/pt-BR/projects');
    expect(metadata.alternates?.languages?.en).toBe('https://exemplo.test/en/projects');
    expect(metadata.alternates?.languages?.['x-default']).toBe('https://exemplo.test/pt-BR/projects');

    expect(og.type).toBe('website');
    expect(og.locale).toBe('pt_BR');
    expect(og.alternateLocale).toEqual(['en_US']);
    expect(og.images).toBeUndefined();

    expect(twitter.card).toBe('summary');
    expect(twitter.title).toBe('Projetos');
  });

  it('adds the OG image and article type when provided', () => {
    const metadata = pageMetadata('en', {
      title: 'Artigo',
      path: '/writeups/x',
      type: 'article',
      image: '/images/writeups/x.png',
    });
    const og = metadata.openGraph as unknown as {
      type?: string;
      locale?: string;
      alternateLocale?: string[];
      images?: unknown;
    };

    expect(og.type).toBe('article');
    expect(og.locale).toBe('en_US');
    expect(og.alternateLocale).toEqual(['pt_BR']);
    expect(og.images).toEqual([{ url: '/images/writeups/x.png' }]);
  });
});

describe('langAttribute', () => {
  it('maps locale to the html lang value', () => {
    expect(langAttribute('pt-BR')).toBe('pt-BR');
    expect(langAttribute('en')).toBe('en');
  });
});
