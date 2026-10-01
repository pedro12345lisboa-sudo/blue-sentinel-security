import type { Metadata } from 'next';
import { StatusView } from '@/components/status/status-view';
import { getSite, pageMetadata, type Locale } from '@/i18n';

interface StatusProps {
  params: { locale: Locale };
}

export async function generateMetadata({ params }: StatusProps): Promise<Metadata> {
  const site = getSite(params.locale);
  return pageMetadata(params.locale, {
    title: site.seo.status.title,
    description: site.seo.status.description,
    path: '/status',
  });
}

export default function StatusPage() {
  return <StatusView />;
}
