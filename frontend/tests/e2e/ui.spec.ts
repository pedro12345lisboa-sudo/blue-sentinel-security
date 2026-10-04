import { test, expect } from '@playwright/test';
import { gotoStable } from './helpers';

test.describe('Página 404', () => {
  test('unknown route renders not-found page', async ({ page }) => {
    const response = await page.goto('/pt-BR/esta-pagina-nao-existe');
    expect(response?.status()).toBe(404);

    await expect(page.locator('h1')).toContainText('Página não encontrada');
    await expect(page.getByText('404')).toBeVisible();
  });

  test('not-found page links back home', async ({ page }) => {
    await gotoStable(page, '/pt-BR/esta-pagina-nao-existe');
    await page.getByRole('link', { name: 'Voltar ao início' }).click();
    await expect(page).toHaveURL(/\/pt-BR\/?$/);
  });
});

test.describe('Teclado', () => {
  test('skip link jumps to main content', async ({ page }) => {
    await page.goto('/pt-BR/contact');

    await page.keyboard.press('Tab');
    await expect(page.locator('.skip-link:focus')).toBeVisible();

    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
  });

  test('form fields are reachable by keyboard', async ({ page }) => {
    await page.goto('/pt-BR/contact');

    await page.locator('#name').focus();
    await page.keyboard.type('Teclado Teste');
    await page.keyboard.press('Tab');
    await expect(page.locator('#email')).toBeFocused();
    await page.keyboard.type('teclado@example.com');
    await page.keyboard.press('Tab');
    await expect(page.locator('#subject')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#message')).toBeFocused();
    await page.keyboard.type('Mensagem digitada apenas com o teclado.');

    await expect(page.locator('button:has-text("Enviar mensagem")')).toBeEnabled();
  });
});

test.describe('Movimento reduzido', () => {
  test('animations are effectively disabled with prefers-reduced-motion', async ({ browser }) => {
    const context = await browser.newContext({      viewport: { width: 1280, height: 720 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.goto('/pt-BR/lab');

    const duration = await page.evaluate(() => {
      const el = document.querySelector('.animate-pulse');
      return el ? getComputedStyle(el).animationDuration : '0s';
    });

    expect(parseFloat(duration)).toBeLessThanOrEqual(0.01);
    await context.close();
  });
});
