import type { Metadata } from 'next';
import { StatusView } from '@/components/status/status-view';
import { site } from '../../../content/site';

export const metadata: Metadata = {
  title: site.seo.status.title,
  description: site.seo.status.description,
};

export default function StatusPage() {
  return <StatusView />;
}
