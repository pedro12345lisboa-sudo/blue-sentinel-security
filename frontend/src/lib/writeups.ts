import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const writeupsDirectory = path.join(process.cwd(), 'frontend/content/writeups');

export interface WriteupFrontmatter {
  title: string;
  description: string;
  date: string;
  tags: string[];
  readingTime?: number;
  coverImage?: string;
  series?: string;
  slug: string;
}

function getAllWriteups(): WriteupFrontmatter[] {
  if (!fs.existsSync(writeupsDirectory)) {
    return [];
  }

  const fileNames = fs.readdirSync(writeupsDirectory);
  const writeups = fileNames
    .filter((fileName) => fileName.endsWith('.mdx'))
    .map((fileName) => {
      const fullPath = path.join(writeupsDirectory, fileName);
      const fileContents = fs.readFileSync(fullPath, 'utf8');
      const { data } = matter(fileContents);
      return {
        ...data,
        slug: fileName.replace(/\.mdx$/, ''),
      } as WriteupFrontmatter;
    })
    .sort((a, b) => (new Date(b.date) > new Date(a.date) ? 1 : -1));

  return writeups;
}

function getWriteupBySlug(slug: string): { frontmatter: WriteupFrontmatter; content: string } | null {
  const fullPath = path.join(writeupsDirectory, `${slug}.mdx`);
  if (!fs.existsSync(fullPath)) {
    return null;
  }

  const fileContents = fs.readFileSync(fullPath, 'utf8');
  const { data, content } = matter(fileContents);
  return {
    frontmatter: { ...data, slug } as WriteupFrontmatter,
    content,
  };
}

export async function generateStaticParams() {
  const writeups = getAllWriteups();
  return writeups.map((writeup) => ({
    slug: writeup.slug,
  }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const writeup = getWriteupBySlug(slug);
  if (!writeup) {
    return { title: 'Writeup Not Found' };
  }

  return {
    title: writeup.frontmatter.title,
    description: writeup.frontmatter.description,
    openGraph: {
      title: writeup.frontmatter.title,
      description: writeup.frontmatter.description,
      type: 'article',
      publishedTime: writeup.frontmatter.date,
      tags: writeup.frontmatter.tags,
    },
  };
}

export { getAllWriteups, getWriteupBySlug };