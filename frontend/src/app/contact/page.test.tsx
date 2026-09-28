import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContactForm } from '@/app/contact/page';
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
    
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/subject/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/message/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send message/i })).toBeInTheDocument();
  });

  it('shows validation errors for empty fields', async () => {
    renderWithProviders(<ContactForm />);
    
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/name must be at least 2 characters/i)).toBeInTheDocument();
      expect(screen.getByText(/invalid email address/i)).toBeInTheDocument();
      expect(screen.getByText(/subject must be at least 5 characters/i)).toBeInTheDocument();
      expect(screen.getByText(/message must be at least 20 characters/i)).toBeInTheDocument();
    });
  });

  it('submits form successfully', async () => {
    (global.fetch as vi.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    renderWithProviders(<ContactForm />);

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'John Doe' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'john@example.com' } });
    fireEvent.change(screen.getByLabelText(/subject/i), { target: { value: 'general' } });
    fireEvent.change(screen.getByLabelText(/message/i), { 
      target: { value: 'This is a test message that is long enough to pass validation.' } 
    });

    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

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
      expect(screen.getByText(/message sent successfully/i)).toBeInTheDocument();
    });
  });

  it('shows error toast on failed submission', async () => {
    (global.fetch as vi.Mock).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ detail: 'Rate limited' }),
    });

    renderWithProviders(<ContactForm />);

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'John Doe' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'john@example.com' } });
    fireEvent.change(screen.getByLabelText(/subject/i), { target: { value: 'general' } });
    fireEvent.change(screen.getByLabelText(/message/i), { 
      target: { value: 'This is a test message that is long enough to pass validation.' } 
    });

    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      expect(screen.getByText(/rate limited/i)).toBeInTheDocument();
    });
  });

  it('disables submit button during submission', async () => {
    let resolveFetch: (value: any) => void;
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    (global.fetch as vi.Mock).mockReturnValueOnce(fetchPromise);

    renderWithProviders(<ContactForm />);

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'John Doe' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'john@example.com' } });
    fireEvent.change(screen.getByLabelText(/subject/i), { target: { value: 'general' } });
    fireEvent.change(screen.getByLabelText(/message/i), { 
      target: { value: 'This is a test message that is long enough to pass validation.' } 
    });

    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    expect(screen.getByRole('button', { name: /sending.../i })).toBeDisabled();

    resolveFetch!({ ok: true, json: () => Promise.resolve({ success: true }) });
    await fetchPromise;
  });
});