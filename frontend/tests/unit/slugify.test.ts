import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';

import { extractHeadings, nodeText, slugify } from '@/lib/slugify';

describe('slugify', () => {
  it('normalizes accents and separators', () => {
    expect(slugify('Detecção de SQL Injection')).toBe('deteccao-de-sql-injection');
    expect(slugify('  Raspagem de dados  ')).toBe('raspagem-de-dados');
  });

  it('drops punctuation', () => {
    expect(slugify('C++: o guia (com exemplos)!')).toBe('c-o-guia-com-exemplos');
  });
});

describe('extractHeadings', () => {
  it('collects h2 and h3 with stable ids', () => {
    const mdx = ['# Um (não pega)\n', '## Título Um\n', '### `código`\n', '## Outro Título\n'].join('\n');

    expect(extractHeadings(mdx)).toEqual([
      { id: 'titulo-um', text: 'Título Um', level: 2 },
      { id: 'codigo', text: 'código', level: 3 },
      { id: 'outro-titulo', text: 'Outro Título', level: 2 },
    ]);
  });

  it('ignores headings inside code fences and duplicates', () => {
    const mdx = ['## Real', '```bash', '## Falso', '```', '## Real', '## Real'].join('\n');
    const headings = extractHeadings(mdx);

    expect(headings.map((h) => h.text)).toEqual(['Real', 'Real', 'Real']);
    expect(new Set(headings.map((h) => h.id)).size).toBe(3);
  });

  it('returns empty for markdown without headings', () => {
    expect(extractHeadings('só texto\n- item\n')).toEqual([]);
  });
});

describe('nodeText', () => {
  it('flattens strings, numbers, arrays and elements', () => {
    const element = { props: { children: ['Filho ', 'aqui'] } } as unknown as ReactNode;

    expect(nodeText('texto')).toBe('texto');
    expect(nodeText(42)).toBe('42');
    expect(nodeText(['a', 1, ['b']])).toBe('a1b');
    expect(nodeText(element)).toBe('Filho aqui');
  });

  it('returns empty for nullish, boolean and primitives', () => {
    expect(nodeText(null)).toBe('');
    expect(nodeText(undefined)).toBe('');
    expect(nodeText(false)).toBe('');
    expect(nodeText(true)).toBe('');
  });
});
