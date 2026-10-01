import { expect, type Locator, type Page } from '@playwright/test';

const middayOffset = 12 - new Date().getUTCHours();

export const MIDDAY_ZONE =
  middayOffset === 0
    ? 'Etc/GMT'
    : `Etc/GMT${middayOffset > 0 ? '-' : '+'}${Math.abs(middayOffset)}`;

export async function signIn(page: Page): Promise<void> {
  await page.request.post('/__reset');
  await page.request.post('/api/pair', { data: { code: '123456', deviceName: 'Test phone' } });
  await page.goto('/');
}

export async function signInWithWorker(page: Page): Promise<void> {
  await signIn(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
  await expect(page.getByRole('button', { name: 'Code', exact: true })).toBeVisible();
}

export async function openSession(page: Page, title: string): Promise<void> {
  await page.getByRole('link', { name: new RegExp(title) }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
}

export async function openFolder(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Code', exact: true }).click();
  await page.getByRole('link', { name: 'vscode-pocket-pilot', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'vscode-pocket-pilot' })).toBeVisible();
}

export async function openTerminal(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Terminals', exact: true }).click();
  await page.getByRole('link', { name: new RegExp(`^${name}`) }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

export function frames(page: Page): Promise<unknown> {
  return page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  );
}

export function scrollGap(pane: Locator): Promise<number> {
  return pane.evaluate(
    (element) => element.scrollHeight - element.clientHeight - element.scrollTop
  );
}
