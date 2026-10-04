'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PrintButton({ label }: { label: string }) {
  return (
    <Button variant="outline" onClick={() => window.print()} className="no-print">
      <Download className="mr-2 h-4 w-4" aria-hidden="true" />
      {label}
    </Button>
  );
}
