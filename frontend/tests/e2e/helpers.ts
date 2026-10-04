import { expect, type Page } from '@playwright/test';

/** Espera o React montar (marcador `html[data-hydrated]` da HydrationMarker). */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForSelector('html[data-hydrated="true"]', { state: 'attached', timeout: 30_000 });
}

/**
 * Navega e espera a hidratação do App Router antes de qualquer interação.
 *
 * Clicar num `next/link` antes da hidratação concluir faz o router abortar a
 * navegação em dev (compilação sob demanda + prefetch), o que deixa o teste
 * preso esperando a URL. O marcador cobre a montagem do React e `networkidle`
 * cobre o carregamento dos chunks e do prefetch do destino.
 */
export async function gotoStable(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await waitForHydration(page);
  await page.waitForLoadState('networkidle');
}

/** Volta para a rota anterior e espera a página ficar estável de novo. */
export async function goBackStable(page: Page): Promise<void> {
  await page.goBack();
  await waitForHydration(page);
  await page.waitForLoadState('networkidle');
}

export function hamburgerMenu(page: Page) {
  return page.locator('header button[aria-controls="mobile-menu"]');
}

/**
 * Abre o menu mobile (hambúrguer) quando o viewport esconde a navegação
 * horizontal. Devolve `true` se o menu foi aberto — nesse caso os links devem
 * ser procurados dentro de `#mobile-menu`.
 */
export async function openMenuIfMobile(page: Page): Promise<boolean> {
  if (!(await hamburgerMenu(page).isVisible().catch(() => false))) return false;
  await hamburgerMenu(page).click();
  await expect(page.locator('#mobile-menu')).toBeVisible();
  return true;
}

/** Clica num link de navegação visível (desktop) ou no item do menu mobile. */
export async function clickNav(page: Page, href: string): Promise<void> {
  if (await openMenuIfMobile(page)) {
    await page.locator(`#mobile-menu a[href="${href}"]`).click();
    return;
  }
  const link = page.locator(`a[href="${href}"]`).filter({ visible: true }).first();
  await expect(link).toBeVisible();
  await link.click();
}

/** Troca de idioma pelo comutador do header (desktop) ou do menu mobile. */
export async function switchLocale(page: Page, target: 'en' | 'pt-BR'): Promise<void> {
  const label = target === 'en' ? 'English' : 'Portugu';
  if (await openMenuIfMobile(page)) {
    await page.locator(`#mobile-menu a[aria-label*="${label}"]`).click();
    return;
  }
  const link = page.locator(`a[aria-label*="${label}"]`).filter({ visible: true }).first();
  await expect(link).toBeVisible();
  await link.click();
}
