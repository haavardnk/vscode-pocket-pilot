import { expect, test } from '@playwright/test';

import { openFolder, openSession, signIn } from './helpers';

const KEYWORDS: Record<string, string> = {
  latte: 'rgb(136, 57, 239)',
  mocha: 'rgb(203, 166, 247)'
};

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('shows the branch and sync status of each folder', async ({ page }) => {
  await page.getByRole('button', { name: 'Code' }).click();
  await expect(
    page.getByRole('link', { name: 'vscode-pocket-pilot', exact: true })
  ).toHaveAccessibleDescription('feat/web ↑2 ↓1 · 3 changed');
  await expect(
    page.getByRole('link', { name: 'immich-edit', exact: true })
  ).toHaveAccessibleDescription('9c1e5d7');
  await page.getByRole('button', { name: 'Chats' }).click();
  await openSession(page, 'Build the phone app');
  await expect(page.getByRole('banner').getByText('vscode-pocket-pilot · feat/web')).toBeVisible();
});

test('browses the repository and highlights a file', async ({ page }, testInfo) => {
  await openFolder(page);
  const files = page.getByRole('list', { name: 'Files' });
  await expect(files.getByRole('link', { name: /node_modules/ })).toBeVisible();
  for (const name of ['packages', 'web', 'src']) await files.getByRole('link', { name }).click();
  await files.getByRole('link', { name: 'App.svelte' }).click();
  await expect(page.getByRole('heading', { name: 'App.svelte' })).toBeVisible();
  const code = page.getByTestId('code');
  await expect(code).toContainText('import SessionList');
  const keyword = code.locator('.code-tokens span', { hasText: /^import$/ }).first();
  await expect(keyword).toHaveCSS('color', KEYWORDS[testInfo.project.name] ?? '');
  const wrap = page.getByRole('button', { name: 'Wrap lines' });
  await wrap.click();
  await expect(wrap).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('banner').getByText('packages/web/src')).toBeVisible();
  await expect(files.getByRole('link', { name: 'App.svelte' })).toBeVisible();
});

test('reviews uncommitted changes', async ({ page }) => {
  await openFolder(page);
  await page.getByRole('tab', { name: 'Changes' }).click();
  const changes = page.getByRole('list', { name: 'Changed files' });
  await expect(changes.getByRole('link')).toHaveCount(3);
  await changes.getByRole('link', { name: /routing\.ts/ }).click();
  const diff = page.getByTestId('diff');
  await expect(diff.locator('[data-kind="removed"]')).toContainText(
    "export type Route = { name: 'chats' };"
  );
  await expect(diff.locator('[data-kind="added"]')).toContainText("{ name: 'code' }");
  await page.getByRole('link', { name: 'Open file' }).click();
  await expect(page.getByTestId('code')).toContainText('export function parseRoute');
});

test('keeps and undoes the edits of a chat', async ({ page }) => {
  await openSession(page, 'Build the phone app');
  await page.getByRole('link', { name: 'Changes (2)' }).click();
  await page
    .getByRole('list', { name: 'Changed files' })
    .getByRole('link', { name: /App\.svelte/ })
    .click();
  await expect(page.getByTestId('diff').locator('[data-kind="added"]').first()).toContainText(
    'import Composer'
  );
  await page.getByRole('button', { name: 'Keep' }).click();
  await expect(page.getByText('Kept')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Keep' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByText(/Compared with the last commit/)).toBeVisible();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Undo all' }).click();
  const changes = page.getByRole('list', { name: 'Changed files' });
  await expect(changes.getByText('Undone')).toBeVisible();
  await expect(changes.getByText('Kept')).toBeVisible();
  await expect(page.getByRole('button', { name: /Keep all/ })).toHaveCount(0);
});

test('shows the files one message changed', async ({ page }) => {
  await openSession(page, 'Build the phone app');
  const request = page.locator('[data-request="r1"]');
  const steps = request.locator('summary', { hasText: 'Updated the app shell' });
  await expect(steps).toContainText('+1 −0');
  await expect(request.getByRole('link', { name: /App\.svelte/ })).toBeHidden();
  await steps.click();
  await expect(request.getByRole('img', { name: 'Done' })).toBeVisible();
  await expect(request.getByRole('link', { name: /App\.svelte/ })).toBeVisible();
  await expect(request.getByRole('img', { name: 'Running' })).toBeVisible();
  await request.getByRole('link', { name: 'Files changed (1)' }).click();
  await expect(page.getByRole('heading', { name: 'Message changes' })).toBeVisible();
  const changes = page.getByRole('list', { name: 'Changed files' });
  await expect(changes.getByRole('link')).toHaveCount(1);
  await changes.getByRole('link', { name: /App\.svelte/ }).click();
  await expect(page.getByTestId('diff').locator('[data-kind="added"]').first()).toContainText(
    'import Composer'
  );
  await expect(page.getByRole('button', { name: 'Keep' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Message changes' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Keep all/ })).toHaveCount(0);
});
