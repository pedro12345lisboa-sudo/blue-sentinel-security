'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PrintButtonProps {
  label: string;
}

export function PrintButton({ label }: PrintButtonProps) {
  return (
    <Button variant="outline" onClick={() => window.print()}>
      <Download className="h-4 w-4 mr-2" aria-hidden="true" />
      {label}
    </Button>
  );
}
