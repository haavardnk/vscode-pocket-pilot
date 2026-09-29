import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await page.getByRole('combobox', { name: 'Repository' }).selectOption('Open another folder…');
  await expect(page.getByRole('heading', { name: 'Open folder' })).toBeVisible();
});

test('opens a folder in a new window', async ({ page }) => {
  const recent = page.getByRole('list', { name: 'Recent' });
  await expect(recent.getByRole('button', { name: 'vscode-pocket-pilot' })).toBeDisabled();
  await recent.getByRole('button', { name: 'photo-tools' }).click();
  await expect(page.getByText('Opened photo-tools')).toBeVisible();
  const picker = page.getByRole('combobox', { name: 'Repository' });
  await expect(picker.locator('option:checked')).toHaveText('photo-tools');
  await expect(page.getByText('No chats yet')).toBeVisible();
});

test('filters folders by name and path', async ({ page }) => {
  await page.getByRole('searchbox', { name: 'Search folders' }).fill('raw');
  await expect(page.getByRole('list', { name: 'Recent' })).toBeHidden();
  const projects = page.getByRole('list', { name: 'Projects' });
  await expect(projects.getByRole('button')).toHaveText([/raw-pipeline/]);
  await page.getByRole('searchbox', { name: 'Search folders' }).fill('nothing-here');
  await expect(page.getByText('No matching folders')).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('combobox', { name: 'Repository' })).toHaveValue('*');
});

test('opens the folder list from the windows screen', async ({ page }) => {
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('link', { name: /VS Code windows/ }).click();
  await page.getByRole('link', { name: 'Open folder' }).click();
  await expect(page.getByRole('heading', { name: 'Open folder' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Projects' }).getByRole('button')).toHaveCount(2);
});
