import { render, screen } from '@testing-library/react';
import { I18nProvider, type Messages } from '@/i18n';
import HomePage from './page';
import ptMessages from '../../../messages/pt-BR.json';
import enMessages from '../../../messages/en.json';

const renderHome = (locale: 'pt-BR' | 'en') =>
  render(
    <I18nProvider
      locale={locale}
      site={(locale === 'en' ? enMessages : ptMessages) as Messages}
    >
      <HomePage params={{ locale }} />
    </I18nProvider>
  );

describe('HomePage', () => {
  it('renders the pt-BR home', () => {
    renderHome('pt-BR');

    expect(
      screen.getByRole('heading', { level: 1, name: /Portfólio de Blue Team e Detection Engineering/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 1, name: /Blue Team and Detection Engineering portfolio/ })
    ).not.toBeInTheDocument();
  });

  it('renders the English home', () => {
    renderHome('en');

    expect(
      screen.getByRole('heading', { level: 1, name: /Blue Team and Detection Engineering portfolio/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 1, name: /Portfólio de Blue Team e Detection Engineering/ })
    ).not.toBeInTheDocument();
  });

  it('links to localized internal routes', () => {
    renderHome('pt-BR');

    const labLink = screen.getAllByRole('link').find((link) =>
      (link.getAttribute('href') ?? '').includes('/lab')
    );
    expect(labLink).toBeDefined();
    expect(labLink).toHaveAttribute('href', expect.stringContaining('/pt-BR/'));
  });
});
