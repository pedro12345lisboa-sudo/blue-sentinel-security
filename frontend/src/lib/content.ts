import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { locale } from '../../content/site';

export function contentRoot(): string {
  const candidates = [
    path.join(process.cwd(), 'frontend', 'content'),
    path.join(process.cwd(), 'content'),
  ];
  return candidates.find((dir) => fs.existsSync(dir)) ?? candidates[0];
}

export function contentDir(...segments: string[]): string {
  return path.join(contentRoot(), locale, ...segments);
}

export function readMdx<T = Record<string, unknown>>(
  ...segments: string[]
): { frontmatter: T; content: string } | null {
  const fullPath = contentDir(...segments);
  if (!fs.existsSync(fullPath)) return null;
  const fileContents = fs.readFileSync(fullPath, 'utf8');
  const { data, content } = matter(fileContents);
  return { frontmatter: data as T, content };
}
