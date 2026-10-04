'use client';

import { useSite } from '@/i18n';
import { NotFoundView } from '@/components/not-found-view';

export default function NotFound() {
  const site = useSite();
  return <NotFoundView site={site} />;
}
