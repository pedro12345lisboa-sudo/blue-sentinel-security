'use client';

import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSite } from '@/i18n';

/**
 * Aviso "conteúdo ainda não traduzido": aparece quando a página está servida
 * pelo fallback do idioma padrão (pt-BR) porque a tradução não existe yet.
 */
export function UntranslatedNotice({ className }: { className?: string }) {
  const site = useSite();

  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm',
        className
      )}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
      <div>
        <p className="font-semibold text-foreground">{site.i18n.untranslatedTitle}</p>
        <p className="text-muted-foreground">{site.i18n.untranslatedBody}</p>
      </div>
    </div>
  );
}
