import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContactForm } from '@/components/contact/contact-form';
import { type Mock } from 'vitest';
import { ToastProvider, ToastViewport } from '@/components/ui/toast';
import { I18nProvider, type Locale, type Messages } from '@/i18n';
import ptMessages from '../../../../messages/pt-BR.json';
import enMessages from '../../../../messages/en.json';

// Mock fetch
global.fetch = vi.fn();

const renderWithProviders = (ui: React.ReactElement, locale: Locale = 'pt-BR') => {
  return render(
    <I18nProvider locale={locale} site={(locale === 'en' ? enMessages : ptMessages) as Messages}>
      <ToastProvider>
        {ui}
        <ToastViewport />
      </ToastProvider>
    </I18nProvider>
  );
};

describe('ContactForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all form fields', () => {
    renderWithProviders(<ContactForm />);
    
    expect(screen.getByLabelText(/nome/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/assunto/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mensagem/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enviar mensagem/i })).toBeInTheDocument();
  });

  it('shows validation errors for invalid fields', async () => {
    renderWithProviders(<ContactForm />);

    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'invalido' } });
    fireEvent.change(screen.getByLabelText(/assunto/i), { target: { value: 'ab' } });
    fireEvent.change(screen.getByLabelText(/mensagem/i), { target: { value: 'curta' } });

    await waitFor(() => {
      expect(screen.getByText(/nome precisa de pelo menos 2 caracteres/i)).toBeInTheDocument();
      expect(screen.getByText(/e-mail inválido/i)).toBeInTheDocument();
      expect(screen.getByText(/assunto precisa de pelo menos 5 caracteres/i)).toBeInTheDocument();
      expect(screen.getByText(/mensagem precisa de pelo menos 20 caracteres/i)).toBeInTheDocument();
    });
  });


  const fillValidForm = async (locale: Locale = 'pt-BR') => {
    const en = locale === 'en';
    fireEvent.change(screen.getByLabelText(en ? /name/i : /nome/i), { target: { value: 'John Doe' } });
    fireEvent.change(screen.getByLabelText(en ? /email/i : /e-mail/i), {
      target: { value: 'john@example.com' },
    });
    fireEvent.change(screen.getByLabelText(en ? /subject/i : /assunto/i), {
      target: { value: 'general' },
    });
    fireEvent.change(screen.getByLabelText(en ? /message/i : /mensagem/i), {
      target: { value: 'This is a test message that is long enough to pass validation.' },
    });
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: en ? /send message/i : /enviar mensagem/i })
      ).toBeEnabled();
    });
  };

  it('submits form successfully', async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    renderWithProviders(<ContactForm />);

    await fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: /enviar mensagem/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/backend/api/v1/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'John Doe',
          email: 'john@example.com',
          subject: 'general',
          message: 'This is a test message that is long enough to pass validation.',
        }),
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/mensagem enviada com sucesso/i)).toBeInTheDocument();
    });
  });

  it('translates the RATE_LIMIT error code into pt-BR', async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ code: 'RATE_LIMIT', detail: 'Rate limit exceeded' }),
    });

    renderWithProviders(<ContactForm />);

    await fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: /enviar mensagem/i }));

    await waitFor(() => {
      expect(
        screen.getByText('Limite de mensagens atingido. Tente novamente mais tarde.')
      ).toBeInTheDocument();
    });
  });

  it('translates the RATE_LIMIT error code into English', async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ code: 'RATE_LIMIT', detail: 'Rate limit exceeded' }),
    });

    renderWithProviders(<ContactForm />, 'en');

    await fillValidForm('en');
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      expect(screen.getByText('Message limit reached. Try again later.')).toBeInTheDocument();
    });
  });

  it('falls back to the status code when the body carries no error code', async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: () => Promise.resolve({}),
    });

    renderWithProviders(<ContactForm />, 'en');

    await fillValidForm('en');
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      expect(
        screen.getByText('Service temporarily unavailable. Please try again.')
      ).toBeInTheDocument();
    });
  });

  it('disables submit button during submission', async () => {
    let resolveFetch: (value: any) => void;
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    (global.fetch as Mock).mockReturnValueOnce(fetchPromise);

    renderWithProviders(<ContactForm />);

    await fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: /enviar mensagem/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /enviando/i })).toBeDisabled();
    });

    resolveFetch!({ ok: true, json: () => Promise.resolve({ success: true }) });
    await fetchPromise;
  });
});