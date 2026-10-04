import { test, expect } from '@playwright/test';
import { gotoStable, switchLocale } from './helpers';

test.describe('Internacionalização', () => {
  test('root redirects to default locale', async ({ page }) => {
    await gotoStable(page, '/');
    await expect(page).toHaveURL(/\/pt-BR/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  });

  test('locale switcher changes to English', async ({ page }) => {
    await gotoStable(page, '/pt-BR/contact');
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');

    await switchLocale(page, 'en');
    await expect(page).toHaveURL(/\/en\/contact/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('locale switcher changes back to Portuguese', async ({ page }) => {
    await gotoStable(page, '/en/contact');
    await switchLocale(page, 'pt-BR');
    await expect(page).toHaveURL(/\/pt-BR\/contact/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  });
});
