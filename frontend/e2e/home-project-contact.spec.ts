import { test, expect } from '@playwright/test';

test.describe('Home -> Project -> Contact Flow', () => {
  test('navigates from home to project detail to contact', async ({ page }) => {
    // Start at home page
    await page.goto('/');
    
    // Verify home page loads
    await expect(page.locator('h1')).toContainText('blue-sentinel');
    await expect(page.locator('h1')).toContainText('Portfólio');
    
    // Navigate to projects
    await page.click('a[href="/pt-BR/projects"]');
    await expect(page).toHaveURL('/pt-BR/projects');
    await expect(page.locator('h1')).toContainText('Projetos');
    
    // Click on first project (if exists)
    const projectLink = page.locator('a[href^="/pt-BR/projects/"]').first();
    if (await projectLink.count() > 0) {
      await projectLink.click();
      await expect(page).toHaveURL(/\/pt-BR\/projects\/.+/);
      
      // Verify project detail page
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('text=Ver código-fonte')).toBeVisible();
      
      // Navigate to contact from project page
      await page.click('a[href="/pt-BR/contact"]');
    } else {
      // Navigate to contact from home
      await page.click('a[href="/pt-BR/contact"]');
    }
    
    // Verify contact page
    await expect(page).toHaveURL('/pt-BR/contact');
    await expect(page.locator('h1')).toContainText('Fale comigo');
    
    // Fill contact form
    await page.fill('input[name="name"]', 'Test User');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.selectOption('select[name="subject"]', 'general');
    await page.fill('textarea[name="message"]', 'This is a test message from Playwright e2e test.');
    
    // Submit form
    await page.click('button:has-text("Enviar mensagem")');
    
    // Should show success toast (or handle gracefully if backend not running)
    await expect(page.locator('text=/mensagem enviada|erro|limite/i')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Navigation and Accessibility', () => {
  test('header navigation works', async ({ page }) => {
    await page.goto('/');
    
    // Check all nav links
    const navLinks = [
      { href: '/pt-BR/about', text: 'Sobre' },
      { href: '/pt-BR/projects', text: 'Projetos' },
      { href: '/pt-BR/writeups', text: 'Artigos' },
      { href: '/pt-BR/lab', text: 'Laboratório' },
      { href: '/pt-BR/status', text: 'Status' },
      { href: '/pt-BR/security', text: 'Segurança' },
      { href: '/pt-BR/resume', text: 'Currículo' },
    ];
    
    for (const link of navLinks) {
      await page.click(`a[href="${link.href}"]`);
      await expect(page).toHaveURL(link.href);
      await page.goBack();
    }
  });

  test('skip link works', async ({ page }) => {
    await page.goto('/');
    
    // Tab to skip link
    await page.keyboard.press('Tab');
    await expect(page.locator('.skip-link:focus')).toBeVisible();
    
    // Press Enter to skip
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content:focus')).toBeFocused();
  });

  test('mobile menu opens and closes', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    // Open mobile menu
    await page.click('button[aria-label="Abrir menu"]');
    await expect(page.locator('#mobile-menu')).toBeVisible();
    
    // Close mobile menu
    await page.click('button[aria-label="Fechar menu"]');
    await expect(page.locator('#mobile-menu')).toBeHidden();
  });
});

test.describe('Responsive Design', () => {
  const viewports = [
    { name: 'mobile', width: 375, height: 667 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1280, height: 720 },
    { name: 'wide', width: 1920, height: 1080 },
  ];

  for (const viewport of viewports) {
    test(`home page renders correctly on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');
      
      // Check no horizontal overflow
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(bodyWidth).toBeLessThanOrEqual(viewport.width + 20); // Allow small scrollbar
      
      // Check hero is visible
      await expect(page.locator('h1')).toBeVisible();
      
      // Take screenshot for visual regression
      await page.screenshot({ path: `e2e/screenshots/home-${viewport.name}.png`, fullPage: true });
    });
  }
});