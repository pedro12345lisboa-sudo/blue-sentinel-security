'use client';

import { useState } from 'react';
import { site } from '../../../content/site';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CodeBlockProps {
  children?: React.ReactNode;
  className?: string;
  language?: string;
  filename?: string;
}

export function CodeBlock({ children, className, language, filename }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const code = typeof children === 'string' ? children : '';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn('relative rounded-lg border border-border/50 bg-muted/50 overflow-hidden', className)}>
      {(filename || language) && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-muted/30">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {filename && <span className="font-mono">{filename}</span>}
            {language && (
              <span className="px-2 py-0.5 text-xs font-mono bg-muted rounded border border-border/50">
                {language}
              </span>
            )}
          </div>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted"
            aria-label={site.microcopy.codeBlock.ariaCopy}
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-success" aria-hidden="true" />
                <span>{site.microcopy.codeBlock.copied}</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" aria-hidden="true" />
                <span>{site.microcopy.codeBlock.copy}</span>
              </>
            )}
          </button>
        </div>
      )}
      <pre className="p-4 overflow-x-auto text-sm">
        <code className={cn('font-mono text-foreground', language && `language-${language}`)}>
          {children}
        </code>
      </pre>
    </div>
  );
}