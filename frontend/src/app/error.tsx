'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { site } from '../../content/site';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { serverError } = site.microcopy;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertTriangle className="h-8 w-8" aria-hidden="true" />
      </div>
      <p className="mb-2 font-mono text-6xl font-bold text-destructive" aria-hidden="true">
        {serverError.code}
      </p>
      <h1 className="mb-4 text-display-sm font-display font-bold tracking-tight">
        {serverError.title}
      </h1>
      <p className="mb-8 max-w-md text-muted-foreground">{serverError.description}</p>
      <button type="button" onClick={reset} className="btn-primary">
        {site.microcopy.buttons.retry}
      </button>
    </div>
  );
}
