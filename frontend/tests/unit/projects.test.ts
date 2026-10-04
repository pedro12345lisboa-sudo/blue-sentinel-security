import { describe, expect, it } from 'vitest';

import { generateMetadata, getAllProjects, getProjectBySlug } from '@/lib/projects';

describe('getAllProjects', () => {
  it('returns projects sorted by date desc with slug from the filename', () => {
    const projects = getAllProjects();

    expect(projects.length).toBeGreaterThan(0);
    expect(projects[0].slug).toBeTruthy();
    expect(projects[0].title).toBeTruthy();

    const dates = projects.map((p) => new Date(p.date).getTime());
    expect([...dates].sort((a, b) => b - a)).toEqual(dates);
  });
});

describe('getProjectBySlug', () => {
  it('returns the document with the slug injected', () => {
    const [first] = getAllProjects();
    const doc = getProjectBySlug('pt-BR', first.slug);

    expect(doc).not.toBeNull();
    expect(doc?.frontmatter.slug).toBe(first.slug);
    expect(doc?.content.length).toBeGreaterThan(0);
  });

  it('returns null for unknown slugs', () => {
    expect(getProjectBySlug('pt-BR', 'nao-existe')).toBeNull();
  });
});

describe('generateMetadata', () => {
  it('builds article metadata for an existing project', () => {
    const [first] = getAllProjects();
    const metadata = generateMetadata({ params: { slug: first.slug, locale: 'pt-BR' } });
    const og = metadata.openGraph as unknown as {
      type?: string;
      publishedTime?: string;
      tags?: string[];
    };

    expect(metadata.title).toBe(first.title);
    expect(metadata.alternates?.canonical).toContain(`/pt-BR/projects/${first.slug}`);
    expect(og.type).toBe('article');
    expect(og.publishedTime).toBe(first.date);
    expect(og.tags).toEqual(first.tags);
  });

  it('falls back to the not-found title for unknown slugs', () => {
    const metadata = generateMetadata({ params: { slug: 'sumiu', locale: 'en' } });
    const og = metadata.openGraph as unknown as { publishedTime?: string };

    expect(metadata.title).toBeTruthy();
    expect(metadata.alternates?.canonical).toContain('/en/projects/sumiu');
    expect(og.publishedTime).toBeUndefined();
  });
});
