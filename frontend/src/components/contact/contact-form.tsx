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
import { site } from '../../../content/site';

const f = site.pages.contact.form;
const m = site.microcopy;

const contactSchema = z.object({
  name: z.string().min(2, m.form.errorName).max(100, m.form.errorMax),
  email: z.string().email(m.form.errorEmail),
  subject: z.string().min(5, m.form.errorSubject).max(200, m.form.errorMax),
  message: z.string().min(20, m.form.errorMessage).max(5000, m.form.errorMax),
  honeypot: z.string().optional(),
});

type ContactFormData = z.infer<typeof contactSchema>;

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
        let detail = m.toasts.errorBody;
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
        message: m.toasts.successBody,
      });
      reset();
    } catch (error) {
      setToast({
        open: true,
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : m.toasts.errorBody,
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
            <Label htmlFor="name">{f.labels.name}</Label>
            <Input
              id="name"
              placeholder={f.placeholders.name}
              {...register('name')}
              error={errors.name?.message}
              disabled={isSubmitting}
              autoComplete="name"
            />
          </div>
          <div>
            <Label htmlFor="email">{f.labels.email}</Label>
            <Input
              id="email"
              type="email"
              placeholder={f.placeholders.email}
              {...register('email')}
              error={errors.email?.message}
              disabled={isSubmitting}
              autoComplete="email"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="subject">{f.labels.subject}</Label>
          <select
            id="subject"
            {...register('subject')}
            className="input-base"
            disabled={isSubmitting}
            aria-invalid={errors.subject ? 'true' : 'false'}
          >
            {f.subjects.map((s) => (
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
          <Label htmlFor="message">{f.labels.message}</Label>
          <Textarea
            id="message"
            placeholder={f.placeholders.message}
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
          <label htmlFor="website">{m.form.honeypotLabel}</label>
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
          {isSubmitting ? f.submitting : f.submit}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          {f.privacy}
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
            <ToastTitle>
              {toast.type === 'error' ? m.toasts.errorTitle : m.toasts.successTitle}
            </ToastTitle>
            <ToastDescription>{toast.message}</ToastDescription>
          </div>
        </Toast>
      </form>
      <ToastViewport />
    </ToastProvider>
  );
}
