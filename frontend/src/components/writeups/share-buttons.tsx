'use client';


import { useEffect, useState } from 'react';
import { Share2, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSite } from '@/i18n';

interface ShareButtonsProps {
  title: string;
  variant?: 'compact' | 'full';
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

export function ShareButtons({ title, variant = 'compact' }: ShareButtonsProps) {
  const site = useSite();
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);

  // window só existe no navegador, por isso lemos a URL depois que o componente monta.
  useEffect(() => {
    setUrl(window.location.href);
  }, []);

  const currentUrl = () => url || window.location.href;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard bloqueado pelo navegador: ignora
    }
  };

  const nativeShare = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url: currentUrl() });
      } catch {
        // usuário cancelou
      }
    } else {
      await copyLink();
    }
  };

  const xHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`;
  const linkedinHref = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;

  if (variant === 'compact') {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={nativeShare}>
          <Share2 className="mr-2 h-4 w-4" aria-hidden="true" />
          {site.microcopy.share.share}
        </Button>
        <a
          href={xHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground transition-colors hover:text-primary"
          aria-label={site.microcopy.share.onX}
        >
          <XIcon className="h-5 w-5" />
        </a>
        <a
          href={linkedinHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground transition-colors hover:text-primary"
          aria-label={site.microcopy.share.onLinkedIn}
        >
          <LinkedInIcon className="h-5 w-5" />
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="outline" asChild>
        <a href={xHref} target="_blank" rel="noopener noreferrer" aria-label={site.microcopy.share.onX}>
          <XIcon className="mr-2 h-4 w-4" />X
        </a>
      </Button>
      <Button variant="outline" asChild>
        <a href={linkedinHref} target="_blank" rel="noopener noreferrer" aria-label={site.microcopy.share.onLinkedIn}>
          <LinkedInIcon className="mr-2 h-4 w-4" />
          LinkedIn
        </a>
      </Button>
      <Button variant="outline" onClick={copyLink}>
        {copied ? (
          <Check className="mr-2 h-4 w-4" aria-hidden="true" />
        ) : (
          <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
        )}
        {copied ? site.microcopy.share.copied : site.microcopy.share.copyLink}
      </Button>
    </div>
  );
}