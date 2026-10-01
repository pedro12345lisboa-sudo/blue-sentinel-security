import { ReactNode } from 'react';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import type { Messages } from '@/i18n';

interface SiteLayoutProps {
  children: ReactNode;
  site: Messages;
}

export function SiteLayout({ site, children }: SiteLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main-content" className="skip-link">
        {site.nav.skipToContent}
      </a>
      <Header />
      <main id="main-content" className="flex-1" tabIndex={-1}>
        {children}
      </main>
      <Footer site={site} />
    </div>
  );
}
