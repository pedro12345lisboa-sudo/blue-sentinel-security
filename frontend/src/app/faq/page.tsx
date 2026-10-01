import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, HelpCircle } from 'lucide-react';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { readMdx } from '@/lib/content';
import { MDXComponents } from '@/components/mdx-components';
import { site } from '../../../content/site';

interface FaqFrontmatter {
  title?: string;
  seo?: { title?: string; description?: string };
}

export const metadata: Metadata = {
  title: site.seo.faq.title,
  description: site.seo.faq.description,
};

export default function FaqPage() {
  const doc = readMdx<FaqFrontmatter>('faq.mdx');
  const page = site.pages.faq;

  return (
    <div className="min-h-screen">
      <header className="section relative overflow-hidden">
        <div className="gradient-mesh absolute inset-0" aria-hidden="true" />
        <div className="noise-overlay absolute inset-0" aria-hidden="true" />
        <div className="container-wide relative">
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {site.microcopy.buttons.backHome}
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <HelpCircle className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-display-md font-display font-bold tracking-tight">
                {page.title}
              </h1>
              <p className="mt-2 text-lg text-muted-foreground">{page.description}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="container-wide px-6 py-16">
        <div className="mx-auto max-w-3xl">
          {doc ? (
            <MDXRemote source={doc.content} components={MDXComponents({})} />
          ) : (
            <p className="text-muted-foreground">{site.microcopy.empty.writeups}</p>
          )}
        </div>
      </div>
    </div>
  );
}
