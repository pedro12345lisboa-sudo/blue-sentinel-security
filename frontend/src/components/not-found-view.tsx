import { Compass, Terminal } from 'lucide-react';
import { LocalizedLink } from '@/i18n';
import type { Messages } from '@/i18n/messages';

export function NotFoundView({ site }: { site: Messages }) {
  const { notFound } = site.microcopy;

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Compass className="h-8 w-8" aria-hidden="true" />
      </div>
      <p className="mb-2 font-mono text-6xl font-bold text-primary" aria-hidden="true">
        {notFound.code}
      </p>
      <h1 className="mb-4 text-display-sm font-display font-bold tracking-tight">
        {notFound.title}
      </h1>
      <p className="mb-8 max-w-md text-muted-foreground">{notFound.description}</p>
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <LocalizedLink href="/" className="btn-primary">
          {site.microcopy.buttons.backHome}
        </LocalizedLink>
        <LocalizedLink href="/lab" className="btn-outline">
          <Terminal className="h-4 w-4 mr-2" aria-hidden="true" />
          {site.microcopy.buttons.openLab}
        </LocalizedLink>
      </div>
    </div>
  );
}
