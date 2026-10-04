import { describe, expect, it } from 'vitest';

import { contentRoot, readMdx, resolveContentPath } from '@/lib/content';

describe('contentRoot', () => {
  it('resolves the content directory from the working directory', () => {
    expect(contentRoot()).toMatch(/content$/);
  });
});

describe('resolveContentPath', () => {
  it('returns the locale directory when it exists', () => {
    const { dir, untranslated } = resolveContentPath('pt-BR', 'writeups');

    expect(dir).toContain('pt');
    expect(untranslated).toBe(false);
  });

  it('falls back to the default locale and flags the document as untranslated', () => {
    const { dir, untranslated } = resolveContentPath('en', 'writeups', 'sql-injection-fastapi.mdx');

    expect(dir).toContain(`${'pt'}`);
    expect(untranslated).toBe(true);
  });

  it('keeps the preferred path when nothing exists', () => {
    const { dir, untranslated } = resolveContentPath('pt-BR', 'nao-existe', 'arquivo.mdx');

    expect(dir).toContain('nao-existe');
    expect(untranslated).toBe(false);
  });
});

describe('readMdx', () => {
  it('parses frontmatter and body of an existing document', () => {
    const doc = readMdx<{ title: string }>('pt-BR', 'writeups', 'sigma-rules-101.mdx');

    expect(doc).not.toBeNull();
    expect(doc?.frontmatter.title).toBeTruthy();
    expect(doc?.content.length).toBeGreaterThan(0);
    expect(doc?.untranslated).toBe(false);
  });

  it('reads untranslated documents through the fallback locale', () => {
    const doc = readMdx('en', 'writeups', 'sql-injection-fastapi.mdx');

    expect(doc?.untranslated).toBe(true);
    expect(doc?.content.length).toBeGreaterThan(0);
  });

  it('returns null when the document does not exist', () => {
    expect(readMdx('pt-BR', 'writeups', 'arquivo-que-nao-existe.mdx')).toBeNull();
  });
});
