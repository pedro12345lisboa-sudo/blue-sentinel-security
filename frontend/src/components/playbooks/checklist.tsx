'use client';

import * as React from 'react';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ChecklistSectionInput {
  title?: string;
  items: string[];
}

export interface ChecklistLabels {
  /** Opcional: quando ausente, o grupo é rotulado por `ariaLabel` (ex.: um h2 da página). */
  groupLabel?: string;
  /** Ex.: "concluídos" → "3 / 12 concluídos". */
  progressLabel: string;
  resetLabel: string;
}

interface ChecklistProps {
  /** Chave estável por playbook/seção; o estado fica só no navegador do visitante. */
  storageKey: string;
  sections: ChecklistSectionInput[];
  labels: ChecklistLabels;
  /** Rótulo acessível do grupo quando não há título visível. */
  ariaLabel: string;
  className?: string;
}

const storagePrefix = 'blue-sentinel:checklist:';

function readStored(key: string): Record<string, true> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(storagePrefix + key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: Record<string, true> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value === true) result[id] = true;
    }
    return result;
  } catch {
    return {};
  }
}

function writeStored(key: string, value: Record<string, true>): void {
  if (typeof window === 'undefined') return;
  try {
    if (Object.keys(value).length === 0) {
      window.localStorage.removeItem(storagePrefix + key);
      return;
    }
    window.localStorage.setItem(storagePrefix + key, JSON.stringify(value));
  } catch {
    /* localStorage indisponível (modo privado): o checklist segue na sessão */
  }
}

/**
 * Checklist interativo com barra de progresso e botão de reiniciar.
 *
 * Acessibilidade: nativamente usa `input[type=checkbox]` (navegação por teclado
 * e leitor de tela sem código extra) dentro de um `role="group"` rotulado, com
 * a barra de progresso anunciada por `role="progressbar"`.
 */
export function Checklist({ storageKey, sections, labels, ariaLabel, className }: ChecklistProps) {
  const [checked, setChecked] = React.useState<Record<string, true>>({});
  const headingId = `checklist-${storageKey.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
  const groupLabelledBy = labels.groupLabel ? { 'aria-labelledby': headingId } : {};

  React.useEffect(() => {
    setChecked(readStored(storageKey));
  }, [storageKey]);

  const total = sections.reduce((sum, section) => sum + section.items.length, 0);
  const done = Object.keys(checked).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      writeStored(storageKey, next);
      return next;
    });
  };

  const reset = () => {
    setChecked({});
    writeStored(storageKey, {});
  };

  return (
    <div
      role="group"
      aria-label={labels.groupLabel ? undefined : ariaLabel}
      {...groupLabelledBy}
      className={cn('space-y-4', className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {labels.groupLabel ? (
          <h3 id={headingId} className="text-lg font-semibold">
            {labels.groupLabel}
          </h3>
        ) : (
          <span id={headingId} className="sr-only">
            {ariaLabel}
          </span>
        )}
        <div className="flex items-center gap-3">
          <span className="text-sm tabular-nums text-muted-foreground" aria-hidden="true">
            {done} / {total} {labels.progressLabel}
          </span>
          <button
            type="button"
            onClick={reset}
            className="no-print inline-flex items-center gap-1.5 rounded-lg border border-border/50 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible-ring"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {labels.resetLabel}
          </button>
        </div>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={`${done} / ${total}`}
        aria-labelledby={headingId}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="space-y-4">
        {sections.map((section, sectionIndex) => {
          const body = (
            <ul className="space-y-2">
              {section.items.map((item, itemIndex) => {
                const id = `${sectionIndex}-${itemIndex}`;
                return (
                  <li key={id}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-transparent p-2 transition-colors hover:border-border/50 hover:bg-card/50">
                      <input
                        type="checkbox"
                        checked={checked[id] === true}
                        onChange={() => toggle(id)}
                        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border accent-primary focus-visible-ring"
                      />
                      <span className="text-sm leading-relaxed text-muted-foreground">{item}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          );

          if (!section.title) {
            return <div key={section.title ?? sectionIndex}>{body}</div>;
          }

          return (
            <div key={section.title} className="rounded-xl border border-border/50 bg-card/40 p-4">
              <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {section.title}
              </h4>
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
