'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Send, CheckCircle, AlertCircle, Loader2, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Toast, ToastProvider, ToastViewport, ToastTitle, ToastDescription } from '@/components/ui/toast';

const contactSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address'),
  subject: z.string().min(5, 'Subject must be at least 5 characters').max(200),
  message: z.string().min(20, 'Message must be at least 20 characters').max(5000),
  honeypot: z.string().optional(),
});

type ContactFormData = z.infer<typeof contactSchema>;

const subjects = [
  { value: 'general', label: 'General Inquiry' },
  { value: 'collaboration', label: 'Collaboration / Partnership' },
  { value: 'speaking', label: 'Speaking Engagement' },
  { value: 'security', label: 'Security Vulnerability Report' },
  { value: 'other', label: 'Other' },
];

export function ContactForm() {
  const [toast, setToast] = useState<{ open: boolean; type: 'success' | 'error'; message: string }>({ open: false, type: 'success', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isValid },
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: '',
      email: '',
      subject: 'general',
      message: '',
      honeypot: '',
    },
  });

  const onSubmit = async (data: ContactFormData) => {
    if (data.honeypot) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/backend/api/v1/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          subject: data.subject,
          message: data.message,
        }),
      });

      if (response.ok) {
        setToast({ open: true, type: 'success', message: 'Message sent successfully! I\'ll get back to you soon.' });
        reset();
      } else {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to send message');
      }
    } catch (error) {
      setToast({ open: true, type: 'error', message: error instanceof Error ? error.message : 'Something went wrong. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ToastProvider>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="Your name"
              {...register('name')}
              error={errors.name?.message}
              disabled={isSubmitting}
              autoComplete="name"
            />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              {...register('email')}
              error={errors.email?.message}
              disabled={isSubmitting}
              autoComplete="email"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="subject">Subject</Label>
          <select
            id="subject"
            {...register('subject')}
            className="input-base"
            disabled={isSubmitting}
            aria-invalid={errors.subject ? 'true' : 'false'}
          >
            {subjects.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          {errors.subject && <p className="mt-1.5 text-sm text-destructive" role="alert">{errors.subject.message}</p>}
        </div>

        <div>
          <Label htmlFor="message">Message</Label>
          <Textarea
            id="message"
            placeholder="Tell me about your project, inquiry, or just say hello..."
            rows={6}
            {...register('message')}
            error={errors.message?.message}
            disabled={isSubmitting}
          />
        </div>

        <input type="hidden" {...register('honeypot')} tabIndex={-1} autoComplete="off" />

        <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting || !isValid} loading={isSubmitting}>
          <Send className="h-4 w-4 mr-2" aria-hidden="true" />
          {isSubmitting ? 'Sending...' : 'Send Message'}
        </Button>

        <p className="text-sm text-muted-foreground text-center">
          No spam, ever. Your email is only used to reply to this message.
        </p>

        <Toast open={toast.open} onOpenChange={(open) => setToast({ ...toast, open })} variant={toast.type === 'error' ? 'destructive' : 'success'}>
          {toast.type === 'error' ? <AlertCircle className="h-5 w-5" /> : <CheckCircle className="h-5 w-5" />}
          <div className="flex-1">
            <ToastTitle>{toast.type === 'error' ? 'Error' : 'Success'}</ToastTitle>
            <ToastDescription>{toast.message}</ToastDescription>
          </div>
        </Toast>
      </form>
      <ToastViewport />
    </ToastProvider>
  );
}

export const metadata = {
  title: 'Contact',
  description: 'Get in touch for collaboration, speaking engagements, or security inquiries.',
};

export default function ContactPage() {
  return (
    <div className="min-h-screen">
      <section className="section relative overflow-hidden">
        <div className="absolute inset-0 gradient-mesh" aria-hidden="true" />
        <div className="absolute inset-0 noise-overlay" aria-hidden="true" />
        <div className="container-wide relative">
          <div className="max-w-2xl mx-auto text-center">
            <h1 className="mb-4 text-display-lg font-display font-bold tracking-tight">
              Get In Touch
            </h1>
            <p className="text-lg text-muted-foreground text-balance">
              Have a project in mind? Want to collaborate? Found a security issue?
              I'd love to hear from you. Fill out the form or email directly.
            </p>
          </div>
        </div>
      </section>

      <section className="section-sm bg-gradient-to-b from-background to-card/50" aria-labelledby="contact-info-title">
        <div className="container-wide">
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="text-center">
              <CardContent className="pt-6">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mx-auto">
                  <Mail className="h-6 w-6" aria-hidden="true" />
                </div>
                <h3 className="mb-2 font-semibold">Email</h3>
                <a href="mailto:contact@blue-sentinel.local" className="text-primary hover:underline">contact@blue-sentinel.local</a>
                <p className="mt-1 text-sm text-muted-foreground">Preferred for security reports</p>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardContent className="pt-6">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-success/10 text-success mx-auto">
                  <MessageSquare className="h-6 w-6" aria-hidden="true" />
                </div>
                <h3 className="mb-2 font-semibold">GitHub Issues</h3>
                <a href="https://github.com/your-org/blue-sentinel/issues" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Open an issue</a>
                <p className="mt-1 text-sm text-muted-foreground">For feature requests & bugs</p>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardContent className="pt-6">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-warning/10 text-warning mx-auto">
                  <Mail className="h-6 w-6" aria-hidden="true" />
                </div>
                <h3 className="mb-2 font-semibold">Security</h3>
                <a href="mailto:security@blue-sentinel.local" className="text-primary hover:underline">security@blue-sentinel.local</a>
                <p className="mt-1 text-sm text-muted-foreground">Responsible disclosure only</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="form-title">
        <div className="container-wide">
          <div className="max-w-2xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle>Send a Message</CardTitle>
                <CardDescription>All fields are required. I typically respond within 48 hours.</CardDescription>
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