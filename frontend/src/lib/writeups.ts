import { Metadata } from 'next';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { readMdx, resolveContentPath } from './content';
import { defaultLocale, getSite, pageMetadata, type Locale } from '@/i18n';

export interface WriteupFrontmatter {
  title: string;
  description: string;
  date: string;
  /** Data da última atualização (opcional; usado em `article:modified_time`/JSON-LD). */
  updated?: string;
  tags: string[];
  readingTime?: number;
  /** Imagem OG 1200×630 (`/images/writeups/...`). */
  cover?: string;
  coverImage?: string;
  series?: string;
  slug: string;
}

export interface WriteupDocument {
  frontmatter: WriteupFrontmatter;
  content: string;
  untranslated: boolean;
}

export function getAllWriteups(locale: Locale = defaultLocale): WriteupFrontmatter[] {
  const { dir } = resolveContentPath(locale, 'writeups');
  if (!fs.existsSync(dir)) {
    return [];
  }

  const fileNames = fs.readdirSync(dir);
  return fileNames
    .filter((fileName) => fileName.endsWith('.mdx'))
    .map((fileName) => {
      const fullPath = path.join(dir, fileName);
      const { data } = matter(fs.readFileSync(fullPath, 'utf8'));
      return {
        ...data,
        slug: fileName.replace(/\.mdx$/, ''),
      } as WriteupFrontmatter;
    })
    .sort((a, b) => (new Date(b.date) > new Date(a.date) ? 1 : -1));
}

export function getWriteupBySlug(locale: Locale, slug: string): WriteupDocument | null {
  const doc = readMdx<WriteupFrontmatter>(locale, 'writeups', `${slug}.mdx`);
  if (!doc) return null;
  return { ...doc, frontmatter: { ...doc.frontmatter, slug } };
}

export async function generateStaticParams(locale: Locale = defaultLocale) {
  return getAllWriteups(locale).map((writeup) => ({ slug: writeup.slug }));
}

export function generateMetadata({
  params,
}: {
  params: { slug: string; locale: string };
}): Metadata {
  const locale = (params.locale as Locale) ?? defaultLocale;
  const site = getSite(locale);
  const writeup = getWriteupBySlug(locale, params.slug);

  if (!writeup) {
    return pageMetadata(locale, {
      title: site.pages.writeups.labels.notFound,
      path: `/writeups/${params.slug}`,
      type: 'article',
    });
  }

  const base = pageMetadata(locale, {
    title: writeup.frontmatter.title,
    description: writeup.frontmatter.description,
    path: `/writeups/${params.slug}`,
    type: 'article',
    image: writeup.frontmatter.cover ?? writeup.frontmatter.coverImage,
  });

  return {
    ...base,
    openGraph: {
      ...base.openGraph,
      type: 'article' as const,
      publishedTime: writeup.frontmatter.date,
      modifiedTime: writeup.frontmatter.updated ?? writeup.frontmatter.date,
      tags: writeup.frontmatter.tags,
    },
  };
}
