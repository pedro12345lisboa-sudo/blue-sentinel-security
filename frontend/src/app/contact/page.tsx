import type { Metadata } from 'next';
import { Mail, MessageSquare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ContactForm } from '@/components/contact/contact-form';

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Get in touch for collaboration, speaking engagements, or security inquiries.',
};

// TROQUE por seus dados reais antes de publicar.
const CONTACT_EMAIL = 'contact@blue-sentinel.local';
const SECURITY_EMAIL = 'security@blue-sentinel.local';
const ISSUES_URL = 'https://github.com/pedro12345lisboa-sudo/blue-sentinel-security/issues';

export default function ContactPage() {
  return (
    <div className="min-h-screen">
      <section className="section relative overflow-hidden">
        <div className="gradient-mesh absolute inset-0" aria-hidden="true" />
        <div className="noise-overlay absolute inset-0" aria-hidden="true" />
        <div className="container-wide relative">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="mb-4 font-display text-display-lg font-bold tracking-tight">
              Get In Touch
            </h1>
            <p className="text-balance text-lg text-muted-foreground">
              Have a project in mind? Want to collaborate? Found a security issue?
              I&apos;d love to hear from you. Fill out the form or email directly.
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
            Contact channels
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="text-center">
              <CardContent className="pt-6">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Mail className="h-6 w-6" aria-hidden="true" />
                </div>
                <h3 className="mb-2 font-semibold">Email</h3>
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
                  {CONTACT_EMAIL}
                </a>
                <p className="mt-1 text-sm text-muted-foreground">General contact</p>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardContent className="pt-6">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-success/10 text-success">
                  <MessageSquare className="h-6 w-6" aria-hidden="true" />
                </div>
                <h3 className="mb-2 font-semibold">GitHub Issues</h3>
                <a
                  href={ISSUES_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Open an issue
                </a>
                <p className="mt-1 text-sm text-muted-foreground">
                  For feature requests &amp; bugs
                </p>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardContent className="pt-6">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-warning/10 text-warning">
                  <Mail className="h-6 w-6" aria-hidden="true" />
                </div>
                <h3 className="mb-2 font-semibold">Security</h3>
                <a href={`mailto:${SECURITY_EMAIL}`} className="text-primary hover:underline">
                  {SECURITY_EMAIL}
                </a>
                <p className="mt-1 text-sm text-muted-foreground">
                  Responsible disclosure only
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
                <CardTitle id="form-title">Send a Message</CardTitle>
                <CardDescription>
                  All fields are required. I typically respond within 48 hours.
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