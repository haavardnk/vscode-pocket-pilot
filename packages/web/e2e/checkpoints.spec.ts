import { expect, type Page, test } from '@playwright/test';

import { openSession, signIn } from './helpers';

const JPEG = 'Extract the JPEG encoder.';
const PNG = 'Add a PNG encoder next to it.';
const SUMMARY = 'Summarise the export modules.';

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await openSession(page, 'Split the exporter');
});

async function openActions(page: Page, message: string, action: RegExp): Promise<void> {
  await page.getByRole('button', { name: message, exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Message actions' })
    .getByRole('button', { name: action })
    .click();
}

test('restores a checkpoint after confirming and redoes it', async ({ page }) => {
  await openActions(page, PNG, /^Restore checkpoint/);
  const confirm = page.getByRole('dialog', { name: 'Message actions' }).getByRole('alert');
  await expect(confirm).toContainText(
    'Removes this and 1 later message and undoes edits to 1 file.'
  );
  await confirm.getByRole('button', { name: 'Restore' }).click();

  const restored = page.getByText('Checkpoint restored');
  await expect(restored).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Message' })).toHaveValue(PNG);
  await expect(page.getByRole('button', { name: PNG, exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: SUMMARY, exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: JPEG, exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(restored).toHaveCount(0);
  await expect(page.getByRole('button', { name: PNG, exact: true })).toBeVisible();
});

test('drops undone messages when a new message is sent', async ({ page }) => {
  await openActions(page, SUMMARY, /^Restore checkpoint/);
  await expect(page.getByText('Checkpoint restored')).toBeVisible();
  const message = page.getByRole('textbox', { name: 'Message' });
  await expect(message).toHaveValue(SUMMARY);

  await message.fill('List the encoders.');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Done: List the encoders.')).toBeVisible();
  await expect(page.getByText('There are two encoders now.')).toHaveCount(0);
  await expect(page.getByText('Checkpoint restored')).toHaveCount(0);
  await expect(page.getByText('Added a PNG encoder.')).toBeVisible();
});
