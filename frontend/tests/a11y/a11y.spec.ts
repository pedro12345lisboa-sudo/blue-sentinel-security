import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

const PUBLIC_ROUTES = [
  { path: '/', name: 'home' },
  { path: '/pt-BR/about', name: 'about' },
  { path: '/pt-BR/contact', name: 'contact' },
  { path: '/pt-BR/projects', name: 'projects' },
  { path: '/pt-BR/lab', name: 'lab' },
  { path: '/pt-BR/status', name: 'status' },
  { path: '/pt-BR/security', name: 'security' },
  { path: '/pt-BR/resume', name: 'resume' },
  { path: '/pt-BR/writeups', name: 'writeups' },
  { path: '/pt-BR/faq', name: 'faq' },
  { path: '/pt-BR/playbooks', name: 'playbooks' },
  { path: '/pt-BR/rota-inexistente', name: 'not-found' },
];

test.describe('Acessibilidade (axe) — rotas públicas', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route.name}: zero violações graves ou críticas`, async ({ page }) => {
      await page.goto(route.path);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const serious = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );
      expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
    });
  }
});
