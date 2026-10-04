import { Metadata } from 'next';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { readMdx, resolveContentPath } from './content';
import { defaultLocale, getSite, pageMetadata, type Locale } from '@/i18n';

export interface ProjectFrontmatter {
  title: string;
  description: string;
  date: string;
  tags: string[];
  highlight?: boolean;
  icon?: string;
  status?: string;
  links?: {
    github?: string;
    demo?: string;
    docs?: string;
  };
  thumbnail?: string;
  slug: string;
}

export interface ProjectDocument {
  frontmatter: ProjectFrontmatter;
  content: string;
  untranslated: boolean;
}

export function getAllProjects(locale: Locale = defaultLocale): ProjectFrontmatter[] {
  const { dir } = resolveContentPath(locale, 'projects');
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
      } as ProjectFrontmatter;
    })
    .sort((a, b) => (new Date(b.date) > new Date(a.date) ? 1 : -1));
}

export function getProjectBySlug(locale: Locale, slug: string): ProjectDocument | null {
  const doc = readMdx<ProjectFrontmatter>(locale, 'projects', `${slug}.mdx`);
  if (!doc) return null;
  return { ...doc, frontmatter: { ...doc.frontmatter, slug } };
}

export async function generateStaticParams(locale: Locale = defaultLocale) {
  return getAllProjects(locale).map((project) => ({ slug: project.slug }));
}

export function generateMetadata({
  params,
}: {
  params: { slug: string; locale: string };
}): Metadata {
  const locale = (params.locale as Locale) ?? defaultLocale;
  const site = getSite(locale);
  const project = getProjectBySlug(locale, params.slug);

  if (!project) {
    return pageMetadata(locale, {
      title: site.pages.projects.detail.notFound,
      path: `/projects/${params.slug}`,
      type: 'article',
    });
  }

  const base = pageMetadata(locale, {
    title: project.frontmatter.title,
    description: project.frontmatter.description,
    path: `/projects/${params.slug}`,
    type: 'article',
    image: project.frontmatter.thumbnail,
  });

  return {
    ...base,
    openGraph: {
      ...base.openGraph,
      type: 'article' as const,
      publishedTime: project.frontmatter.date,
      tags: project.frontmatter.tags,
    },
  };
}
