import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContactForm } from '@/components/contact/contact-form';
import { type Mock } from 'vitest';
import { ToastProvider, ToastViewport } from '@/components/ui/toast';

// Mock fetch
global.fetch = vi.fn();

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <ToastProvider>
      {ui}
      <ToastViewport />
    </ToastProvider>
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


  const fillValidForm = async () => {
    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'John Doe' } });
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'john@example.com' } });
    fireEvent.change(screen.getByLabelText(/assunto/i), { target: { value: 'general' } });
    fireEvent.change(screen.getByLabelText(/mensagem/i), {
      target: { value: 'This is a test message that is long enough to pass validation.' },
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /enviar mensagem/i })).toBeEnabled();
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

  it('shows error toast on failed submission', async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ detail: 'Rate limited' }),
    });

    renderWithProviders(<ContactForm />);

    await fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: /enviar mensagem/i }));

    await waitFor(() => {
      expect(screen.getByText(/rate limited/i)).toBeInTheDocument();
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