'use client';

import { SiteLayout } from '@/layouts/site-layout';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ToastProvider, ToastViewport } from '@/components/ui/toast';
import { ThemeProvider } from 'next-themes';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <TooltipProvider>
        <ToastProvider>
          <SiteLayout>{children}</SiteLayout>
          <ToastViewport />
        </ToastProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}