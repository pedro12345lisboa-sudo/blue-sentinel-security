'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useSite } from '@/i18n';

const VARIANTS: Record<string, 'destructive' | 'warning' | 'default' | 'success' | 'ghost'> = {
  critical: 'destructive',
  high: 'warning',
  medium: 'default',
  low: 'success',
  informational: 'ghost',
};

export function severityVariant(severity: string) {
  return VARIANTS[severity] ?? 'ghost';
}

export function SeverityBadge({
  severity,
  className,
  size,
}: {
  severity: string;
  className?: string;
  size?: 'sm' | 'default';
}) {
  const site = useSite();
  const labels = site.pages.lab.severity as unknown as Record<string, string | undefined>;
  const label = labels[severity] ?? severity;
  return (
    <Badge variant={severityVariant(severity)} size={size === 'sm' ? 'sm' : undefined} className={cn('uppercase tracking-wide', className)}>
      {label}
    </Badge>
  );
}
