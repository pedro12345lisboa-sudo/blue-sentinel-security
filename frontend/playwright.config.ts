import fs from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
import { chromium } from 'playwright';

/**
 * Resolve o browser local: usa o Chromium do Playwright quando instalado;
 * caso contrário (máquina sem download do CDN) cai para o Edge do sistema.
 * No CI o Chromium é instalado com `playwright install --with-deps chromium`.
 */
function browserLaunchOptions(): { channel?: string } {
  if (process.env.PLAYWRIGHT_CHANNEL) return { channel: process.env.PLAYWRIGHT_CHANNEL };
  if (process.env.CI) return {};
  try {
    const exe = chromium.executablePath();
    if (exe && fs.existsSync(exe)) return {};
  } catch {
    /* executável indisponível: usa o Edge do sistema */
  }
  return { channel: 'msedge' };
}

const launchOptions = browserLaunchOptions();

export default defineConfig({
  testDir: './tests',
  testMatch: ['**/*.spec.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // O dev server do Next compila rotas sob demanda: com muitos workers em
  // paralelo as primeiras requisições disputam CPU e estouram o timeout.
  workers: process.env.CI ? 2 : 4,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    locale: 'pt-BR',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    ...launchOptions,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...launchOptions },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 5'], ...launchOptions },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
