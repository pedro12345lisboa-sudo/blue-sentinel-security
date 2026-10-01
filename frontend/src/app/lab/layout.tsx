import type { Metadata } from 'next';
import { site } from '../../../content/site';

export const metadata: Metadata = {
  title: site.seo.lab.title,
  description: site.seo.lab.description,
};

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
