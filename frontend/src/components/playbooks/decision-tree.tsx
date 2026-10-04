'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface DecisionTreeProps {
  /** Código-fonte do diagrama em sintaxe Mermaid (`flowchart TD`). */
  code: string;
  /** Texto alternativo/legenda do diagrama. */
  title: string;
  /** Rótulo do `<summary>` que revela o código Mermaid. */
  sourceLabel: string;
  className?: string;
}

/**
 * Árvore de decisão em Mermaid.
 *
 * O SVG é renderizado no cliente com `import('mermaid')` (chunk separado, fora
 * do bundle principal). Sem JS (ou se o Mermaid falhar) o código-fonte é
 * exibido em `<pre>`, o que também mantém a impressão em PDF legível.
 */
export function DecisionTree({ code, title, sourceLabel, className }: DecisionTreeProps) {
  const [svg, setSvg] = React.useState<string | null>(null);
  const idRef = React.useRef<string>(
    `bs-decision-tree-${Math.random().toString(36).slice(2, 10)}`
  );

  React.useEffect(() => {
    let cancelled = false;

    import('mermaid')
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          theme: 'neutral',
          securityLevel: 'strict',
        });
        const rendered = await mermaid.render(idRef.current, code);
        if (!cancelled) setSvg(rendered.svg);
      })
      .catch((error: unknown) => {
        console.error('[playbooks] falha ao renderizar o diagrama Mermaid', error);
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <figure className={cn('my-6', className)}>
      <div
        className={cn(
          'overflow-x-auto rounded-xl border border-border/50 bg-card/50 p-4',
          !svg && 'font-mono text-xs'
        )}
        role="img"
        aria-label={title}
      >
        {svg ? (
          <div className="flex justify-center [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <pre className="whitespace-pre-wrap text-muted-foreground">{code}</pre>
        )}
      </div>

      <figcaption className="mt-2 text-sm text-muted-foreground">{title}</figcaption>

      <details className="no-print mt-3">
        <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
          {sourceLabel}
        </summary>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs">{code}</pre>
      </details>
    </figure>
  );
}
