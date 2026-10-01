import { site } from '../../content/site';

export default function Loading() {
  return (
    <div
      className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-4"
      role="status"
      aria-live="polite"
    >
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <p className="font-mono text-sm text-muted-foreground">
        {site.microcopy.loading.page}
      </p>
    </div>
  );
}
