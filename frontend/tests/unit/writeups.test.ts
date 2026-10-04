import { describe, expect, it } from 'vitest';

import { generateMetadata, getAllWriteups, getWriteupBySlug } from '@/lib/writeups';

describe('getAllWriteups', () => {
  it('returns writeups sorted by date desc with slug from the filename', () => {
    const writeups = getAllWriteups();

    expect(writeups.length).toBeGreaterThan(0);
    expect(writeups[0].slug).toBeTruthy();
    expect(writeups[0].title).toBeTruthy();

    const dates = writeups.map((w) => new Date(w.date).getTime());
    expect([...dates].sort((a, b) => b - a)).toEqual(dates);
  });
});

describe('getWriteupBySlug', () => {
  it('returns the document with the slug injected', () => {
    const doc = getWriteupBySlug('pt-BR', 'sigma-rules-101');

    expect(doc).not.toBeNull();
    expect(doc?.frontmatter.slug).toBe('sigma-rules-101');
    expect(doc?.content.length).toBeGreaterThan(0);
  });

  it('returns null for unknown slugs', () => {
    expect(getWriteupBySlug('pt-BR', 'nao-existe')).toBeNull();
  });
});

describe('generateMetadata', () => {
  it('builds article metadata for an existing writeup', () => {
    const metadata = generateMetadata({ params: { slug: 'sigma-rules-101', locale: 'pt-BR' } });
    const og = metadata.openGraph as unknown as {
      type?: string;
      publishedTime?: string;
    };

    expect(metadata.title).toBeTruthy();
    expect(metadata.alternates?.canonical).toContain('/pt-BR/writeups/sigma-rules-101');
    expect(og.type).toBe('article');
    expect(og.publishedTime).toBeTruthy();
  });

  it('falls back to the not-found title for unknown slugs', () => {
    const metadata = generateMetadata({ params: { slug: 'sumiu', locale: 'pt-BR' } });
    const og = metadata.openGraph as unknown as {
      type?: string;
      publishedTime?: string;
    };

    expect(metadata.title).toBeTruthy();
    expect(metadata.alternates?.canonical).toContain('/pt-BR/writeups/sumiu');
    expect(og.type).toBe('article');
    expect(og.publishedTime).toBeUndefined();
  });
});
