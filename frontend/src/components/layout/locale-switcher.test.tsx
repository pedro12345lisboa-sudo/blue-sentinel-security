import { render, screen } from '@testing-library/react';
import { LocaleSwitcher } from './locale-switcher';
import { I18nProvider, type Messages } from '@/i18n';
import ptMessages from '../../../messages/pt-BR.json';

const route = vi.hoisted(() => ({ pathname: '/pt-BR/projects' }));

vi.mock('next/navigation', () => ({
  usePathname: () => route.pathname,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

const renderSwitcher = (site: Messages) =>
  render(
    <I18nProvider locale="pt-BR" site={site}>
      <LocaleSwitcher />
    </I18nProvider>
  );

describe('LocaleSwitcher', () => {
  beforeEach(() => {
    route.pathname = '/pt-BR/projects';
    window.location.hash = '';
  });

  afterAll(() => {
    window.location.hash = '';
  });

  it('renders one link per locale with localized accessible labels', () => {
    renderSwitcher(ptMessages as Messages);

    const pt = screen.getByRole('link', { name: 'Ver este site em Português (Brasil)' });
    const en = screen.getByRole('link', { name: 'Ver este site em English' });

    expect(pt).toHaveAttribute('href', '/pt-BR/projects');
    expect(en).toHaveAttribute('href', '/en/projects');
    expect(pt).toHaveAttribute('lang', 'pt-BR');
    expect(en).toHaveAttribute('hreflang', 'en');
  });

  it('marks the active locale with aria-current', () => {
    renderSwitcher(ptMessages as Messages);

    const pt = screen.getByRole('link', { name: 'Ver este site em Português (Brasil)' });
    const en = screen.getByRole('link', { name: 'Ver este site em English' });

    expect(pt).toHaveAttribute('aria-current', 'true');
    expect(en).not.toHaveAttribute('aria-current');
  });

  it('keeps the current path when the URL has no locale prefix', () => {
    route.pathname = '/writeups/sigma-rules-101';
    renderSwitcher(ptMessages as Messages);

    expect(screen.getByRole('link', { name: 'Ver este site em English' })).toHaveAttribute(
      'href',
      '/en/writeups/sigma-rules-101'
    );
  });

  it('preserves the section hash when switching locale', () => {
    window.location.hash = '#skills';
    renderSwitcher(ptMessages as Messages);

    expect(screen.getByRole('link', { name: 'Ver este site em English' })).toHaveAttribute(
      'href',
      '/en/projects#skills'
    );
    expect(screen.getByRole('link', { name: 'Ver este site em Português (Brasil)' })).toHaveAttribute(
      'href',
      '/pt-BR/projects#skills'
    );
  });
});
