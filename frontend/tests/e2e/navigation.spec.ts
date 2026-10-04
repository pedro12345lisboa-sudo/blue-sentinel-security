import { test, expect } from '@playwright/test';
import { clickNav, goBackStable, gotoStable } from './helpers';

const NAV_LINKS = [
  { href: '/pt-BR/about', text: 'Sobre' },
  { href: '/pt-BR/projects', text: 'Projetos' },
  { href: '/pt-BR/writeups', text: 'Artigos' },
  { href: '/pt-BR/lab', text: 'Laboratório' },
  { href: '/pt-BR/status', text: 'Status' },
  { href: '/pt-BR/security', text: 'Segurança' },
  { href: '/pt-BR/resume', text: 'Currículo' },
];

test.describe('Navegação', () => {
  test('header navigation works', async ({ page }) => {
    await gotoStable(page, '/');

    for (const link of NAV_LINKS) {
      await clickNav(page, link.href);
      await expect(page).toHaveURL(link.href);
      await expect(page.locator('h1').first()).toBeVisible();
      await goBackStable(page);
    }
  });

  test('home renders hero with portfolio title', async ({ page }) => {
    await gotoStable(page, '/');
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.locator('h1').first()).toContainText('blue-sentinel');
  });

  test('skip link works', async ({ page }) => {
    await gotoStable(page, '/');

    await page.keyboard.press('Tab');
    await expect(page.locator('.skip-link:focus')).toBeVisible();

    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
  });

  test('mobile menu opens and closes', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoStable(page, '/');

    await page.click('button[aria-label="Abrir menu"]');
    await expect(page.locator('#mobile-menu')).toBeVisible();

    await page.locator('#mobile-menu').getByRole('button', { name: 'Fechar' }).click();
    await expect(page.locator('#mobile-menu')).toBeHidden();
  });
});

test.describe('Responsivo', () => {
  const viewports = [
    { name: 'mobile', width: 375, height: 667 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1280, height: 720 },
    { name: 'wide', width: 1920, height: 1080 },
  ];

  for (const viewport of viewports) {
    test(`home page renders correctly on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await gotoStable(page, '/');

      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(bodyWidth).toBeLessThanOrEqual(viewport.width + 20);

      await expect(page.locator('h1').first()).toBeVisible();
    });
  }
});
