import { test, expect, type Page } from '@playwright/test';
import { gotoStable } from './helpers';

const CONTACT_API = '**/api/backend/api/v1/contact';

async function fillValidForm(page: Page) {
  await page.fill('#name', 'Playwright Test');
  await page.fill('#email', 'playwright@example.com');
  await page.selectOption('#subject', 'general');
  await page.fill('#message', 'Mensagem de teste enviada pelo Playwright e2e.');
}

test.describe('Formulário de contato (API mockada)', () => {
  test('submit shows success toast', async ({ page }) => {
    await page.route(CONTACT_API, async (route) => {
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ id: 1, status: 'queued', request_id: 'e2e-test' }),
      });
    });

    await gotoStable(page, '/pt-BR/contact');
    await expect(page.locator('h1')).toContainText('Fale comigo');

    await fillValidForm(page);
    await page.click('button:has-text("Enviar mensagem")');

    await expect(page.getByText('Mensagem enviada', { exact: true })).toBeVisible();
    await expect(page.getByText('Mensagem enviada com sucesso. Respondo em breve.', { exact: true })).toBeVisible();
  });

  test('submit shows error toast on 429', async ({ page }) => {
    await page.route(CONTACT_API, async (route) => {
      await route.fulfill({
        status: 429,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          type: 'about:blank',
          title: 'Too Many Requests',
          status: 429,
          code: 'RATE_LIMIT',
          detail: 'Rate limit exceeded',
          request_id: 'e2e-429',
        }),
      });
    });

    await gotoStable(page, '/pt-BR/contact');
    await fillValidForm(page);
    await page.click('button:has-text("Enviar mensagem")');

    await expect(page.getByText('Erro', { exact: true })).toBeVisible();
    await expect(page.getByText('Limite de mensagens atingido. Tente novamente mais tarde.', { exact: true })).toBeVisible();
  });

  test('submit shows error toast on 500', async ({ page }) => {
    await page.route(CONTACT_API, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          type: 'about:blank',
          title: 'Internal Server Error',
          status: 500,
          code: 'INTERNAL_ERROR',
          detail: 'An unexpected error occurred.',
          request_id: 'e2e-500',
        }),
      });
    });

    await gotoStable(page, '/pt-BR/contact');
    await fillValidForm(page);
    await page.click('button:has-text("Enviar mensagem")');

    await expect(page.getByText('Erro', { exact: true })).toBeVisible();
    await expect(page.getByText('Algo falhou no servidor. Tente novamente em instantes.', { exact: true })).toBeVisible();
  });

  test('client-side validation blocks invalid email', async ({ page }) => {
    const requests: string[] = [];
    await page.route(CONTACT_API, async (route) => {
      requests.push(route.request().url());
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ id: 1, status: 'queued', request_id: 'x' }),
      });
    });

    await gotoStable(page, '/pt-BR/contact');
    await page.fill('#name', 'Playwright Test');
    await page.fill('#email', 'not-an-email');
    await page.fill('#message', 'Mensagem de teste enviada pelo Playwright e2e.');

    const submit = page.locator('button:has-text("Enviar mensagem")');
    await expect(submit).toBeDisabled();

    await page.fill('#email', 'playwright@example.com');
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByText('Mensagem enviada', { exact: true })).toBeVisible();
    expect(requests).toHaveLength(1);
  });

  test('short message shows inline error', async ({ page }) => {
    await gotoStable(page, '/pt-BR/contact');
    await page.fill('#name', 'Playwright Test');
    await page.fill('#email', 'playwright@example.com');
    await page.fill('#message', 'curta');

    await expect(page.locator('#message')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('button:has-text("Enviar mensagem")')).toBeDisabled();
  });

  test('honeypot silently discards submission', async ({ page }) => {
    const requests: string[] = [];
    await page.route(CONTACT_API, async (route) => {
      requests.push(route.request().url());
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ id: 1, status: 'queued', request_id: 'x' }),
      });
    });

    await gotoStable(page, '/pt-BR/contact');
    await fillValidForm(page);
    await page.fill('#website', 'https://spam.example.com');
    await page.click('button:has-text("Enviar mensagem")');

    await expect(page.getByText('Mensagem enviada', { exact: true })).toHaveCount(0);
    expect(requests).toHaveLength(0);
    await expect(page.locator('#name')).toHaveValue('');
  });
});

test.describe('Formulário de contato (API real)', () => {
  test.skip(
    !process.env.E2E_REAL_API,
    'requer E2E_REAL_API=1 e backend em http://localhost:8000',
  );

  test('submit reaches the real backend', async ({ page }) => {
    await gotoStable(page, '/pt-BR/contact');
    await fillValidForm(page);
    await page.click('button:has-text("Enviar mensagem")');

    await expect(page.getByText(/Mensagem enviada|Limite de mensagens/i)).toBeVisible();
  });
});
