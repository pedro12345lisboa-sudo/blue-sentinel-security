'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { Github, ExternalLink, ArrowLeft, Calendar, Tag, Clock, Shield, Code, Zap, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { MDXComponents } from '@/components/mdx-components';
import { getProjectBySlug, ProjectFrontmatter } from '@/lib/projects';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { useReducedMotion, useGSAP, useInView } from '@/hooks';

interface ProjectPageProps {
  params: Promise<{ slug: string }>;
}

const getIcon = (iconName?: string) => {
  switch (iconName) {
    case 'Shield': return <Shield className="h-6 w-6" />;
    case 'Code': return <Code className="h-6 w-6" />;
    case 'Zap': return <Zap className="h-6 w-6" />;
    case 'Terminal': return <Terminal className="h-6 w-6" />;
    default: return <Shield className="h-6 w-6" />;
  }
};

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
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

export default function ProjectPage({ params }: ProjectPageProps) {
  const { slug } = await params;
  const project = getProjectBySlug(slug);

  if (!project) {
    notFound();
  }

  const { frontmatter, content } = project;

  return (
    <article className="min-h-screen">
      <header className="section relative overflow-hidden">
        <div className="absolute inset-0 gradient-mesh" aria-hidden="true" />
        <div className="absolute inset-0 noise-overlay" aria-hidden="true" />
        <div className="container-wide relative">
          <Link href="/projects" className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Projects
          </Link>

          {frontmatter.highlight && (
            <Badge variant="success" className="mb-4 w-fit">
              Featured Project
            </Badge>
          )}

          <div className="mb-6 flex flex-wrap items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
              {getIcon(frontmatter.icon)}
            </div>
            <div>
              <h1 className="text-display-md font-display font-bold tracking-tight">{frontmatter.title}</h1>
              <p className="mt-2 text-lg text-muted-foreground">{frontmatter.description}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" aria-hidden="true" />
              <time dateTime={frontmatter.date}>{new Date(frontmatter.date).toLocaleDateString('pt-BR', { year: 'numeric', month: 'long', day: 'numeric' })}</time>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" aria-hidden="true" />
              <span>{Math.ceil(content.split(/\s+/).length / 200)} min read</span>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {frontmatter.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="gap-1.5">
                <Tag className="h-3 w-3" aria-hidden="true" />
                {tag}
              </Badge>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {frontmatter.links?.github && (
              <Button variant="outline" asChild>
                <a href={frontmatter.links.github} target="_blank" rel="noopener noreferrer">
                  <Github className="h-4 w-4 mr-2" aria-hidden="true" />
                  View Source
                </a>
              </Button>
            )}
            {frontmatter.links?.demo && (
              <Button asChild>
                <a href={frontmatter.links.demo}>
                  <ExternalLink className="h-4 w-4 mr-2" aria-hidden="true" />
                  Live Demo
                </a>
              </Button>
            )}
            {frontmatter.links?.docs && (
              <Button variant="ghost" asChild>
                <a href={frontmatter.links.docs} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" aria-hidden="true" />
                  Documentation
                </a>
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="container-wide py-16 px-6">
        <div className="grid lg:grid-cols-4 gap-12">
          <aside className="lg:col-span-1 space-y-8">
            <Card>
              <CardContent className="pt-6">
                <h3 className="mb-4 text-lg font-semibold">Project Details</h3>
                <dl className="space-y-4 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Type</dt>
                    <dd className="font-medium text-foreground">Security Tooling</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Status</dt>
                    <dd className="font-medium text-success flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
                      Active
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">License</dt>
                    <dd className="font-medium text-foreground">MIT</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Language</dt>
                    <dd className="font-medium text-foreground">
                      {frontmatter.tags.filter((t) => ['C++', 'Python', 'Go', 'Rust', 'TypeScript', 'JavaScript'].includes(t)).join(', ') || 'Multiple'}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <h3 className="mb-4 text-lg font-semibold">Key Technologies</h3>
                <div className="flex flex-wrap gap-2">
                  {frontmatter.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <h3 className="mb-4 text-lg font-semibold">Related</h3>
                <ul className="space-y-2 text-sm">
                  <li><Link href="/projects" className="text-muted-foreground hover:text-primary">← All Projects</Link></li>
                  <li><Link href="/writeups" className="text-muted-foreground hover:text-primary">Technical Writeups</Link></li>
                  <li><Link href="/lab" className="text-muted-foreground hover:text-primary">Detection Lab</Link></li>
                </ul>
              </CardContent>
            </Card>
          </aside>

          <div className="lg:col-span-3">
            <MDXRemote
              source={content}
              components={MDXComponents({})}
            />
          </div>
        </div>
      </div>
    </article>
  );
}