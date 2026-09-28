import { Metadata } from 'next';
import Link from 'next/link';
import { Calendar, Clock, Tag, Filter, Search, ExternalLink, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { getAllWriteups, WriteupFrontmatter } from '@/lib/writeups';

export const metadata: Metadata = {
  title: 'Technical Writeups',
  description: 'Deep-dive articles on detection engineering, threat hunting, malware analysis, and security automation.',
};

const allTags = ['Detection', 'Threat Hunting', 'Malware Analysis', 'Automation', 'eBPF', 'Sigma', 'YARA', 'MITRE ATT&CK', 'Forensics', 'Blue Team'];

export default function WriteupsPage() {
  const writeups = getAllWriteups();

  return (
    <div className="min-h-screen">
      <section className="section relative overflow-hidden">
        <div className="absolute inset-0 gradient-mesh" aria-hidden="true" />
        <div className="absolute inset-0 noise-overlay" aria-hidden="true" />
        <div className="container-wide relative">
          <div className="max-w-3xl">
            <h1 className="mb-4 text-display-lg font-display font-bold tracking-tight">
              Technical Writeups
            </h1>
            <p className="text-lg text-muted-foreground text-balance">
              Deep-dive articles on detection engineering, threat hunting methodologies, malware analysis techniques,
              and security automation patterns. Written for practitioners, by a practitioner.
            </p>
          </div>
        </div>
      </section>

      <section className="section-sm bg-gradient-to-b from-background to-card/50" aria-labelledby="filters-title">
        <div className="container-wide">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <label htmlFor="tag-filter" className="sr-only">Filter by tag</label>
              <select
                id="tag-filter"
                className="input-base w-auto min-w-[200px] bg-background"
                aria-label="Filter writeups by topic"
              >
                <option value="">All Topics</option>
                {allTags.map((tag) => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Tag className="h-4 w-4" aria-hidden="true" />
              <span>{writeups.length} articles</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="writeups-title">
        <div className="container-wide">
          <div className="grid gap-6 lg:grid-cols-3">
            {writeups.map((writeup) => (
              <article key={writeup.slug}>
                <Link
                  href={`/writeups/${writeup.slug}`}
                  className="block h-full rounded-2xl border border-border/50 bg-card/50 p-6 transition-all duration-300 hover:border-primary/30 hover:shadow-glow hover:bg-card"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-xs font-mono text-muted-foreground">
                      {new Date(writeup.date).toLocaleDateString('pt-BR', { year: 'numeric', month: 'short' })}
                    </span>
                    {writeup.series && (
                      <Badge variant="secondary" className="text-xs">
                        {writeup.series}
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="mb-3 group-hover:text-primary transition-colors line-clamp-2">
                    {writeup.title}
                  </CardTitle>
                  <p className="mb-4 text-sm text-muted-foreground line-clamp-3">{writeup.description}</p>
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {writeup.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                    ))}
                    {writeup.tags.length > 3 && (
                      <Badge variant="ghost" className="text-xs">+{writeup.tags.length - 3}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 pt-4 border-t border-border/50">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                      {writeup.readingTime || Math.ceil(writeup.description.split(/\s+/).length / 200)} min
                    </span>
                    <Button variant="ghost" size="sm" asChild className="ml-auto">
                      <a href={`/writeups/${writeup.slug}`}>
                        Read
                        <ArrowRight className="h-3.5 w-3.5 ml-1.5" aria-hidden="true" />
                      </a>
                    </Button>
                  </div>
                </Link>
              </article>
            ))}
          </div>

          {writeups.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No writeups yet. Check back soon!</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}