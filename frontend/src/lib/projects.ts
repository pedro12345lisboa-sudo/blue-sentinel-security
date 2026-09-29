import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const projectsDirectory = path.join(process.cwd(), 'frontend/content/projects');

export interface ProjectFrontmatter {
  title: string;
  description: string;
  date: string;
  tags: string[];
  highlight?: boolean;
  icon?: string;
  links?: {
    github?: string;
    demo?: string;
    docs?: string;
  };
  thumbnail?: string;
  slug: string;
}

function getAllProjects(): ProjectFrontmatter[] {
  if (!fs.existsSync(projectsDirectory)) {
    return [];
  }

  const fileNames = fs.readdirSync(projectsDirectory);
  const projects = fileNames
    .filter((fileName) => fileName.endsWith('.mdx'))
    .map((fileName) => {
      const fullPath = path.join(projectsDirectory, fileName);
      const fileContents = fs.readFileSync(fullPath, 'utf8');
      const { data } = matter(fileContents);
      return {
        ...data,
        slug: fileName.replace(/\.mdx$/, ''),
      } as ProjectFrontmatter;
    })
    .sort((a, b) => (new Date(b.date) > new Date(a.date) ? 1 : -1));

  return projects;
}

function getProjectBySlug(slug: string): { frontmatter: ProjectFrontmatter; content: string } | null {
  const fullPath = path.join(projectsDirectory, `${slug}.mdx`);
  if (!fs.existsSync(fullPath)) {
    return null;
  }

  const fileContents = fs.readFileSync(fullPath, 'utf8');
  const { data, content } = matter(fileContents);
  return {
    frontmatter: { ...data, slug } as ProjectFrontmatter,
    content,
  };
}

export async function generateStaticParams() {
  const projects = getAllProjects();
  return projects.map((project) => ({
    slug: project.slug,
  }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const project = getProjectBySlug(slug);
  if (!project) {
    return { title: 'Project Not Found' };
  }

  return {
    title: project.frontmatter.title,
    description: project.frontmatter.description,
    openGraph: {
      title: project.frontmatter.title,
      description: project.frontmatter.description,
      type: 'article',
      publishedTime: project.frontmatter.date,
      tags: project.frontmatter.tags,
    },
  };
}
export { getAllProjects, getProjectBySlug };
