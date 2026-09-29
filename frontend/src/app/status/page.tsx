import type { Metadata } from 'next';
import { StatusView } from '@/components/status/status-view';

export const metadata: Metadata = {
  title: 'Status',
  description: 'Live health and resource metrics for the Blue-Sentinel platform.',
};

export default function StatusPage() {
  return <StatusView />;
}