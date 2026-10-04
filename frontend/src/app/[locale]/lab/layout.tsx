import type { Metadata } from 'next';
import { getSite, pageMetadata, type Locale } from '@/i18n';

interface LabLayoutProps {
  params: { locale: Locale };
  children: React.ReactNode;
}

export async function generateMetadata({ params }: LabLayoutProps): Promise<Metadata> {
  const site = getSite(params.locale);
  return pageMetadata(params.locale, {
    title: site.seo.lab.title,
    description: site.seo.lab.description,
    path: '/lab',
  });
}

export default function LabLayout({ children }: LabLayoutProps) {
  return <>{children}</>;
}
