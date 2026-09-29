import '@/styles/tokens.css';
import '@/styles/globals.css';

import { SiteLayout } from '@/layouts/site-layout';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ToastProvider, ToastViewport } from '@/components/ui/toast';
import { ThemeProvider } from 'next-themes';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-br">
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <TooltipProvider>
            <ToastProvider>
              <SiteLayout>{children}</SiteLayout>
              <ToastViewport />
            </ToastProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}