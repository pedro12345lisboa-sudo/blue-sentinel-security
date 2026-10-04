'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SavePdfButtonProps {
  label: string;
}

/**
 * O `window.print()` só existe no navegador; o botão vive num componente
 * cliente para a página (Server Component) não repassar um handler para um
 * componente cliente — erro de serialização do React Server Components.
 */
export function SavePdfButton({ label }: SavePdfButtonProps) {
  return (
    <Button variant="outline" onClick={() => window.print()}>
      <Download className="h-4 w-4 mr-2" aria-hidden="true" />
      {label}
    </Button>
  );
}
