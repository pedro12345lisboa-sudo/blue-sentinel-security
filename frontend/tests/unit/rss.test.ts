import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildRssFeed } from '@/lib/rss';
import type { WriteupFrontmatter } from '@/lib/writeups';

const writeup = (overrides: Partial<WriteupFrontmatter> = {}): WriteupFrontmatter => ({
  title: 'Sigma: da hipótese à regra',
  description: 'Como escrever uma regra Sigma testável.',
  date: '2026-01-15',
  tags: ['Sigma', 'Detection'],
  slug: 'sigma-hipotese-regra',
  ...overrides,
});

describe('buildRssFeed', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('produces a valid RSS 2.0 envelope with channel metadata', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://exemplo.test');

    const xml = buildRssFeed({
      locale: 'pt-BR',
      siteName: 'Blue-Sentinel — Portfólio',
      description: 'Artigos técnicos.',
      writeups: [writeup()],
      feedUrl: 'https://exemplo.test/rss.xml',
      siteLink: 'https://exemplo.test/pt-BR',
    });

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('<atom:link href="https://exemplo.test/rss.xml"');
    expect(xml).toContain('<language>pt-BR</language>');
    expect(xml).toContain('<title>Blue-Sentinel — Portfólio</title>');
  });

  it('writes one item per writeup with locale-prefixed absolute links', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://exemplo.test');

    const xml = buildRssFeed({
      locale: 'pt-BR',
      siteName: 'Blue-Sentinel',
      description: 'Artigos.',
      writeups: [writeup(), writeup({ slug: 'agente-cpp', title: 'Agente C++' })],
      feedUrl: 'https://exemplo.test/rss.xml',
      siteLink: 'https://exemplo.test/pt-BR',
    });

    expect(xml).toContain('<link>https://exemplo.test/pt-BR/writeups/sigma-hipotese-regra</link>');
    expect(xml).toContain('<link>https://exemplo.test/pt-BR/writeups/agente-cpp</link>');
    expect(xml.match(/<item>/g)).toHaveLength(2);
    expect(xml).toContain('<guid isPermaLink="true">');
  });

  it('escapes XML entities and adds categories/enclosure', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://exemplo.test');

    const xml = buildRssFeed({
      locale: 'en',
      siteName: 'Blue-Sentinel & Co',
      description: 'A < B',
      writeups: [
        writeup({
          title: 'SQL Injection & Friends',
          description: '<script> não passa',
          cover: '/images/writeups/capa.png',
        }),
      ],
      feedUrl: 'https://exemplo.test/rss.xml',
      siteLink: 'https://exemplo.test/en',
    });

    expect(xml).toContain('SQL Injection &amp; Friends');
    expect(xml).toContain('&lt;script&gt; não passa');
    expect(xml).toContain('<category>Sigma</category>');
    expect(xml).toContain(
      '<enclosure url="https://exemplo.test/images/writeups/capa.png" type="image/png"'
    );
    expect(xml).toContain('<language>en</language>');
  });
});
