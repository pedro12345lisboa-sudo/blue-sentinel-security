'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface MermaidProps {
  /** Código-fonte do diagrama em sintaxe Mermaid (`flowchart LR`, `sequenceDiagram`...). */
  chart: string;
  /** Texto alternativo/legenda do diagrama (obrigatório para a11y). */
  caption: string;
  className?: string;
}

/**
 * Diagrama Mermaid genérico para os artigos.
 *
 * Renderizado no cliente com `import('mermaid')` (chunk separado, fora do
 * bundle principal). Sem JS (ou se o Mermaid falhar) o código-fonte aparece em
 * `<pre>`, o que também mantém o diagrama legível na impressão/PDF.
 */
export function Mermaid({ chart, caption, className }: MermaidProps) {
  const [svg, setSvg] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);
  const idRef = React.useRef<string>(
    `bs-mermaid-${Math.random().toString(36).slice(2, 10)}`
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
        const rendered = await mermaid.render(idRef.current, chart);
        if (!cancelled) setSvg(rendered.svg);
      })
      .catch((error: unknown) => {
        console.error('[writeups] falha ao renderizar o diagrama Mermaid', error);
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [chart]);

  return (
    <figure className={cn('my-6', className)}>
      <div
        className={cn(
          'overflow-x-auto rounded-xl border border-border/50 bg-card/50 p-4',
          !svg && 'font-mono text-xs'
        )}
        role="img"
        aria-label={caption}
      >
        {svg ? (
          <div
            className="flex justify-center [&_svg]:h-auto [&_svg]:max-w-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <pre className="whitespace-pre-wrap text-muted-foreground">
            {failed ? 'Diagrama indisponível (fallback para código-fonte):' : ''}
            {chart}
          </pre>
        )}
      </div>
      <figcaption className="mt-2 text-sm text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}
