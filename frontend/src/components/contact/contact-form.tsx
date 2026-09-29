'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Send, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Toast,
  ToastProvider,
  ToastViewport,
  ToastTitle,
  ToastDescription,
} from '@/components/ui/toast';

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

type ToastState = { open: boolean; type: 'success' | 'error'; message: string };

export function ContactForm() {
  const [toast, setToast] = useState<ToastState>({
    open: false,
    type: 'success',
    message: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isValid },
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      email: '',
      subject: 'general',
      message: '',
      honeypot: '',
    },
  });

  const onSubmit = async (data: ContactFormData) => {
    // Honeypot preenchido = robô. Finge sucesso e não envia nada.
    if (data.honeypot) {
      reset();
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

      if (!response.ok) {
        let detail = 'Failed to send message';
        try {
          const error = await response.json();
          if (typeof error.detail === 'string') detail = error.detail;
        } catch {
          // resposta sem JSON: mantém a mensagem padrão
        }
        throw new Error(detail);
      }

      setToast({
        open: true,
        type: 'success',
        message: "Message sent successfully! I'll get back to you soon.",
      });
      reset();
    } catch (error) {
      setToast({
        open: true,
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Something went wrong. Please try again.',
      });
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
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          {errors.subject && (
            <p className="mt-1.5 text-sm text-destructive" role="alert">
              {errors.subject.message}
            </p>
          )}
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

        {/* Honeypot: campo de texto escondido fora da tela. Humanos não veem, robôs preenchem. */}
        <div
          aria-hidden="true"
          className="absolute left-[-9999px] h-0 w-0 overflow-hidden"
        >
          <label htmlFor="website">Website</label>
          <input
            id="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            {...register('honeypot')}
          />
        </div>

        <Button
          type="submit"
          className="w-full sm:w-auto"
          disabled={isSubmitting || !isValid}
          loading={isSubmitting}
        >
          <Send className="mr-2 h-4 w-4" aria-hidden="true" />
          {isSubmitting ? 'Sending...' : 'Send Message'}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          No spam, ever. Your email is only used to reply to this message.
        </p>

        <Toast
          open={toast.open}
          onOpenChange={(open) => setToast((t) => ({ ...t, open }))}
          variant={toast.type === 'error' ? 'destructive' : 'success'}
        >
          {toast.type === 'error' ? (
            <AlertCircle className="h-5 w-5" aria-hidden="true" />
          ) : (
            <CheckCircle className="h-5 w-5" aria-hidden="true" />
          )}
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