'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { ArrowLeft, Calendar, Clock, Tag, Share2, Github, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { MDXComponents } from '@/components/mdx-components';
import { getWriteupBySlug, WriteupFrontmatter } from '@/lib/writeups';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { useReducedMotion, useGSAP, useInView } from '@/hooks';

interface WriteupPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: WriteupPageProps): Promise<Metadata> {
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

export default function WriteupPage({ params }: WriteupPageProps) {
  const { slug } = await params;
  const writeup = getWriteupBySlug(slug);

  if (!writeup) {
    notFound();
  }

  const { frontmatter, content } = writeup;

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const shareTitle = frontmatter.title;

  return (
    <article className="min-h-screen">
      <header className="section relative overflow-hidden">
        <div className="absolute inset-0 gradient-mesh" aria-hidden="true" />
        <div className="absolute inset-0 noise-overlay" aria-hidden="true" />
        <div className="container-wide relative">
          <Link href="/writeups" className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Writeups
          </Link>

          {frontmatter.series && (
            <Badge variant="secondary" className="mb-4 w-fit">
              {frontmatter.series}
            </Badge>
          )}

          <h1 className="mb-4 text-display-md font-display font-bold tracking-tight text-balance">
            {frontmatter.title}
          </h1>

          <p className="mb-8 max-w-3xl text-lg text-muted-foreground text-balance">
            {frontmatter.description}
          </p>

          <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" aria-hidden="true" />
              <time dateTime={frontmatter.date}>{new Date(frontmatter.date).toLocaleDateString('pt-BR', { year: 'numeric', month: 'long', day: 'numeric' })}</time>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" aria-hidden="true" />
              <span>{frontmatter.readingTime || Math.ceil(content.split(/\s+/).length / 200)} min read</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Tag className="h-4 w-4" aria-hidden="true" />
              <span>{frontmatter.tags.length} tags</span>
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
            <Button variant="outline" size="sm" onClick={() => navigator.share?.({ title: shareTitle, url: shareUrl }) || navigator.clipboard.writeText(shareUrl)}>
              <Share2 className="h-4 w-4 mr-2" aria-hidden="true" />
              Share
            </Button>
            <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareTitle)}&url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors" aria-label="Share on Twitter">
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </a>
            <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors" aria-label="Share on LinkedIn">
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            </a>
          </div>
        </div>
      </header>

      <div className="container-wide py-16 px-6">
        <div className="grid lg:grid-cols-4 gap-12">
          <aside className="lg:col-span-1 space-y-8">
            <Card>
              <CardContent className="pt-6">
                <h3 className="mb-4 text-lg font-semibold">Article Info</h3>
                <dl className="space-y-4 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Published</dt>
                    <dd className="font-medium text-foreground">{new Date(frontmatter.date).toLocaleDateString('pt-BR', { year: 'numeric', month: 'long', day: 'numeric' })}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Reading Time</dt>
                    <dd className="font-medium text-foreground">{frontmatter.readingTime || Math.ceil(content.split(/\s+/).length / 200)} min</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Category</dt>
                    <dd className="font-medium text-foreground">{frontmatter.tags[0] || 'Security'}</dd>
                  </div>
                  {frontmatter.series && (
                    <div>
                      <dt className="text-muted-foreground">Series</dt>
                      <dd className="font-medium text-foreground">{frontmatter.series}</dd>
                    </div>
                  )}
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <h3 className="mb-4 text-lg font-semibold">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {frontmatter.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <h3 className="mb-4 text-lg font-semibold">More Reading</h3>
                <ul className="space-y-2 text-sm">
                  <li><Link href="/writeups" className="text-muted-foreground hover:text-primary">← All Writeups</Link></li>
                  <li><Link href="/projects" className="text-muted-foreground hover:text-primary">Security Projects</Link></li>
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

            <div className="mt-16 pt-8 border-t border-border/50">
              <h2 className="mb-6 text-xl font-semibold">Share this article</h2>
              <div className="flex flex-wrap gap-3">
                <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareTitle)}&url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer" className="btn-outline" aria-label="Share on Twitter">
                  <svg className="h-4 w-4 mr-2" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  Twitter
                </a>
                <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer" className="btn-outline" aria-label="Share on LinkedIn">
                  <svg className="h-4 w-4 mr-2" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.064-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                  LinkedIn
                </a>
                <Button variant="outline" onClick={() => navigator.clipboard.writeText(shareUrl)}>
                  <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                  Copy Link
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}