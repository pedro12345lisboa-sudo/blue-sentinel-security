import type { Metadata } from 'next';
import { Mail, Github, Shield } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ContactForm } from '@/components/contact/contact-form';
import { getSite, pageMetadata, type Locale } from '@/i18n';

interface ContactProps {
  params: { locale: Locale };
}

export function generateMetadata({ params }: ContactProps): Metadata {
  const site = getSite(params.locale);
  return pageMetadata(params.locale, {
    title: site.seo.contact.title,
    description: site.seo.contact.description,
    path: '/contact',
  });
}

export default function ContactPage({ params }: ContactProps) {
  const site = getSite(params.locale);
  const { contacts } = site;
  const page = site.pages.contact;
  const form = page.form;

  return (
    <div className="min-h-screen">
      <section className="section relative overflow-hidden">
        <div className="gradient-mesh absolute inset-0" aria-hidden="true" />
        <div className="noise-overlay absolute inset-0" aria-hidden="true" />
        <div className="container-wide relative">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="mb-4 font-display text-display-lg font-bold tracking-tight">
              {page.title}
            </h1>
            <p className="text-balance text-lg text-muted-foreground">
              {page.description}
            </p>
          </div>
        </div>
      </section>

      <section
        className="section-sm bg-gradient-to-b from-background to-card/50"
        aria-labelledby="contact-info-title"
      >
        <div className="container-wide">
          <h2 id="contact-info-title" className="sr-only">
            {page.channels.ariaLabel}
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="text-center">
              <CardContent className="pt-6">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Mail className="h-6 w-6" aria-hidden="true" />
                </div>
                <h3 className="mb-2 font-semibold">{page.channels.email.title}</h3>
                <a href={`mailto:${contacts.general}`} className="text-primary hover:underline">
                  {contacts.general}
                </a>
                <p className="mt-1 text-sm text-muted-foreground">{page.channels.email.hint}</p>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardContent className="pt-6">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-success/10 text-success">
                  <Github className="h-6 w-6" aria-hidden="true" />
                </div>
                <h3 className="mb-2 font-semibold">{page.channels.issues.title}</h3>
                <a
                  href={contacts.issues}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {page.channels.issues.link}
                </a>
                <p className="mt-1 text-sm text-muted-foreground">
                  {page.channels.issues.hint}
                </p>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardContent className="pt-6">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-warning/10 text-warning">
                  <Shield className="h-6 w-6" aria-hidden="true" />
                </div>
                <h3 className="mb-2 font-semibold">{page.channels.security.title}</h3>
                <a href={`mailto:${contacts.security}`} className="text-primary hover:underline">
                  {contacts.security}
                </a>
                <p className="mt-1 text-sm text-muted-foreground">
                  {page.channels.security.hint}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="form-title">
        <div className="container-wide">
          <div className="mx-auto max-w-2xl">
            <Card>
              <CardHeader>
                <CardTitle id="form-title">{form.title}</CardTitle>
                <CardDescription>
                  {page.form.allRequired} {page.form.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ContactForm />
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
