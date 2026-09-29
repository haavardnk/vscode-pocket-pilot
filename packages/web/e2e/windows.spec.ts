import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('link', { name: /VS Code windows/ }).click();
  await expect(page.getByRole('heading', { name: 'VS Code windows' })).toBeVisible();
});

test('closes a window and keeps the last one open', async ({ page }) => {
  const windows = page.getByRole('list', { name: 'Open windows' });
  await windows.getByRole('button', { name: 'Close immich-edit' }).click();
  const sheet = page.getByRole('dialog', { name: 'Close immich-edit?' });
  await sheet.getByRole('button', { name: 'Close window' }).click();
  await expect(windows.getByRole('listitem')).toHaveCount(1);
  await expect(page.getByText('Closed immich-edit')).toBeVisible();
  await expect(windows.getByRole('button', { name: 'Close vscode-pocket-pilot' })).toBeDisabled();
  await expect(page.getByText('the last open window cannot be closed')).toBeVisible();
});

test('warns before closing a window with active chats', async ({ page }) => {
  await page.getByRole('button', { name: 'Close vscode-pocket-pilot' }).click();
  const sheet = page.getByRole('dialog', { name: 'Close vscode-pocket-pilot?' });
  await expect(sheet.getByText(/still active in this window/)).toBeVisible();
  await sheet.getByRole('button', { name: 'Cancel' }).click();
  await expect(sheet).toBeHidden();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('combobox', { name: 'Theme' })).toBeVisible();
});
