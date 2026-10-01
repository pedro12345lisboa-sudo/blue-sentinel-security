import { cn } from '@/lib/utils';
import type { Messages } from '@/i18n';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Github, ExternalLink, ArrowRight } from 'lucide-react';
import { CodeBlock } from '@/components/common/code-block';
import { TableOfContents } from '@/components/common/table-of-contents';

interface MDXComponentsProps {
  components?: Record<string, React.ComponentType<Record<string, unknown>>>;
  site: Messages;
}

export function MDXComponents({ components, site }: MDXComponentsProps) {
  return {
    ...components,
    h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h1 {...props} className={cn('text-3xl font-display font-bold tracking-tight mt-8 mb-4', props.className)}>{props.children}</h1>
    ),
    h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h2 {...props} className={cn('text-2xl font-display font-semibold tracking-tight mt-10 mb-4 pb-2 border-b border-border/50', props.className)}>{props.children}</h2>
    ),
    h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h3 {...props} className={cn('text-xl font-semibold mt-8 mb-3', props.className)}>{props.children}</h3>
    ),
    h4: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h4 {...props} className={cn('text-lg font-medium mt-6 mb-2', props.className)}>{props.children}</h4>
    ),
    p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
      <p {...props} className={cn('text-base text-muted-foreground leading-relaxed mb-4', props.className)} />
    ),
    a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
      <a
        {...props}
        className={cn('text-primary hover:underline underline-offset-2 transition-colors', props.className)}
        target={props.href?.startsWith('http') ? '_blank' : undefined}
        rel={props.href?.startsWith('http') ? 'noopener noreferrer' : undefined}
      >
        {props.children}
        {props.href?.startsWith('http') && <ExternalLink className="inline h-3.5 w-3.5 ml-1" aria-hidden="true" />}
      </a>
    ),
    ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
      <ul {...props} className={cn('list-disc list-inside space-y-2 mb-4', props.className)} />
    ),
    ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
      <ol {...props} className={cn('list-decimal list-inside space-y-2 mb-4', props.className)} />
    ),
    li: (props: React.HTMLAttributes<HTMLLIElement>) => (
      <li {...props} className={cn('text-base text-muted-foreground leading-relaxed', props.className)} />
    ),
    code: (props: React.HTMLAttributes<HTMLElement>) => (
      <code {...props} className={cn('font-mono text-sm bg-muted px-1.5 py-0.5 rounded', props.className)} />
    ),
    pre: (props: React.HTMLAttributes<HTMLPreElement>) => (
      <CodeBlock {...props} />
    ),
    blockquote: (props: React.QuoteHTMLAttributes<HTMLQuoteElement>) => (
      <blockquote {...props} className={cn('border-l-4 border-primary pl-4 italic text-muted-foreground my-4', props.className)} />
    ),
    hr: (props: React.HTMLAttributes<HTMLHRElement>) => (
      <hr {...props} className={cn('border-border/50 my-8', props.className)} />
    ),
    table: (props: React.TableHTMLAttributes<HTMLTableElement>) => (
      <div className="overflow-x-auto mb-4">
        <table {...props} className={cn('w-full border-collapse', props.className)} />
      </div>
    ),
    th: (props: React.ThHTMLAttributes<HTMLTableCellElement>) => (
      <th {...props} className={cn('border border-border p-3 text-left font-semibold bg-muted/50', props.className)} />
    ),
    td: (props: React.TdHTMLAttributes<HTMLTableCellElement>) => (
      <td {...props} className={cn('border border-border p-3', props.className)} />
    ),
    img: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
      <figure className="my-6">
        <img
          {...props}
          alt={alt ?? ''}
          className={cn('rounded-lg border border-border/50 max-w-full h-auto', props.className)}
        />
        {alt && <figcaption className="text-center text-sm text-muted-foreground mt-2">{alt}</figcaption>}
      </figure>
    ),
    Callout: ({ children, type = 'info', title }: { children: React.ReactNode; type?: 'info' | 'warning' | 'danger' | 'success'; title?: string }) => {
      const styles = {
        info: 'border-primary/30 bg-primary/5 text-primary',
        warning: 'border-warning/30 bg-warning/5 text-warning',
        danger: 'border-destructive/30 bg-destructive/5 text-destructive',
        success: 'border-success/30 bg-success/5 text-success',
      };
      return (
        <div className={cn('rounded-lg border p-4 my-4', styles[type])}>
          {title && <p className="font-semibold mb-2">{title}</p>}
          <div className="text-sm">{children}</div>
        </div>
      );
    },
    TableOfContents: ({ headings }: { headings: Array<{ id: string; text: string; level: number }> }) => (
      <TableOfContents headings={headings} />
    ),
    ProjectCard: ({ project }: { project: any }) => (
      <Card className="group hover:border-primary/30 hover:shadow-glow transition-all">
        <CardHeader>
          <CardTitle className="text-lg">{project.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{project.description}</p>
          <div className="flex flex-wrap gap-2">
            {project.tags?.map((tag: string) => (
              <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
            ))}
          </div>
          <div className="flex items-center gap-3 pt-4 border-t border-border/50">
            {project.links?.github && (
              <Button variant="ghost" size="sm" asChild>
                <a href={project.links.github} target="_blank" rel="noopener noreferrer">
                  <Github className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                  {site.microcopy.projectCard.code}
                </a>
              </Button>
            )}
            {project.links?.demo && (
              <Button variant="ghost" size="sm" asChild>
                <a href={project.links.demo}>
                  <ArrowRight className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                  {site.microcopy.projectCard.demo}
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    ),
  };
}