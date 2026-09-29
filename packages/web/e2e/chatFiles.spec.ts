import { expect, test } from '@playwright/test';

import { openSession, signIn } from './helpers';

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await openSession(page, 'Fix flaky cluster test');
});

test('opens an image the agent viewed', async ({ page }) => {
  await page.getByRole('link', { name: 'icon.png' }).click();
  await expect(page.getByRole('heading', { name: 'icon.png' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'icon.png' })).toBeVisible();
  await page.getByRole('link', { name: 'Open in code' }).click();
  await expect(page).toHaveURL(/#\/file\/w1\/f1\/docs%2Ficon\.png$/);
});

test('opens a search result at its line and returns to the chat', async ({ page }) => {
  await page.getByText('Searched for text parseRoute').click();
  const results = page.getByRole('list', { name: 'Results' });
  await expect(results.getByRole('link')).toHaveText(['routing.ts:3', 'App.svelte']);
  await results.getByRole('link', { name: 'routing.ts:3' }).click();
  await expect(page.getByRole('heading', { name: 'routing.ts' })).toBeVisible();
  await expect(page.getByTestId('current-line')).toContainText(
    'export function parseRoute(hash: string): Route {'
  );
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(results.getByRole('link', { name: 'routing.ts:3' })).toBeVisible();
});

test('resolves relative links in a reply against the workspace', async ({ page }) => {
  await page.getByRole('link', { name: 'routing.ts' }).click();
  await expect(page.getByTestId('current-line')).toContainText('export function parseRoute');
});
