import { cn } from '@/lib/utils';

export interface TimelineStepItem {
  key: string;
  title: string;
  summary: string;
}

interface TimelineStepProps {
  steps: TimelineStepItem[];
  className?: string;
}

/**
 * Linha do tempo da resposta (NIST SP 800-61): contenção → erradicação →
 * recuperação. Componente de apresentação puro, sem estado.
 */
export function TimelineStep({ steps, className }: TimelineStepProps) {
  return (
    <ol className={cn('relative space-y-6 border-l-2 border-border/60 pl-6', className)}>
      {steps.map((step, index) => (
        <li key={step.key} className="relative">
          <span
            aria-hidden="true"
            className="absolute -left-[41px] top-0 flex h-7 w-7 items-center justify-center rounded-full border border-primary/30 bg-card font-mono text-xs font-semibold text-primary"
          >
            {index + 1}
          </span>
          <h4 className="mb-1 text-base font-semibold">{step.title}</h4>
          <p className="text-sm leading-relaxed text-muted-foreground">{step.summary}</p>
        </li>
      ))}
    </ol>
  );
}
