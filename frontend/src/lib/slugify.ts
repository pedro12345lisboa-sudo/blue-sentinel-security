import type { ReactNode } from 'react';

/** Slug de âncora dos títulos: usado nos `id` dos h2/h3 do MDX e no sumário. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

export interface TocHeading {
  id: string;
  text: string;
  level: number;
}

/** Extrai h2/h3 do Markdown/MDX para o sumário (ignua blocos de código). */
export function extractHeadings(mdx: string): TocHeading[] {
  const headings: TocHeading[] = [];
  const seen = new Set<string>();
  let inFence = false;

  for (const line of mdx.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;

    const text = match[2].replace(/[*_`~]/g, '').trim();
    if (!text) continue;

    let id = slugify(text);
    if (seen.has(id)) id = `${id}-${headings.length}`;
    seen.add(id);
    headings.push({ id, text, level: match[1].length });
  }

  return headings;
}

/** Texto puro de um nó React (títulos do MDX podem ter `<code>`/`<strong>`). */
export function nodeText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (typeof node === 'object' && 'props' in node) {
    const element = node as { props?: { children?: ReactNode } };
    return nodeText(element.props?.children);
  }
  return '';
}
