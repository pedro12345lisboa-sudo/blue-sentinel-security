'use client';


import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useSite } from '@/i18n';

interface Heading {
  id: string;
  text: string;
  level: number;
}

interface TableOfContentsProps {
  headings: Heading[];
  className?: string;
}

export function TableOfContents({ headings, className }: TableOfContentsProps) {
  const site = useSite();
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: '-100px 0px -66%' }
    );

    headings.forEach((heading) => {
      const element = document.getElementById(heading.id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <nav className={cn('sticky top-24 space-y-1 max-h-[calc(100vh-8rem)] overflow-y-auto', className)} aria-label={site.microcopy.toc.aria}>
      <h3 className="mb-3 text-sm font-semibold text-foreground uppercase tracking-wider">{site.microcopy.toc.title}</h3>
      <ul className="space-y-1">
        {headings.map((heading) => (
          <li key={heading.id}>
            <a
              href={`#${heading.id}`}
              className={cn(
                'block px-2 py-1 text-sm transition-colors rounded',
                heading.level === 2 ? 'font-medium' : 'text-muted-foreground ml-4',
                activeId === heading.id ? 'text-primary font-medium' : 'hover:text-foreground'
              )}
              onClick={(e) => {
                e.preventDefault();
                const element = document.getElementById(heading.id);
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth' });
                  history.pushState(null, '', `#${heading.id}`);
                  setActiveId(heading.id);
                }
              }}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}