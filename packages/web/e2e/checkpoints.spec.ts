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

test('edits a sent message with a new model, agent and approvals', async ({ page }) => {
  const message = page.getByRole('textbox', { name: 'Message' });
  await message.fill('Unsent draft');
  await openActions(page, PNG, /^Edit message/);
  const banner = page.getByRole('region', { name: 'Editing message' });
  await expect(banner).toContainText(
    'Sending removes this and 1 later message and undoes edits to 1 file.'
  );
  await expect(message).toHaveValue(PNG);
  await expect(page.getByRole('button', { name: PNG, exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'GPT-5' }).click();
  await page
    .getByRole('dialog', { name: 'Model' })
    .getByRole('button', { name: 'Claude Opus' })
    .click();
  await page.getByRole('button', { name: 'Agent', exact: true }).click();
  await page.getByRole('dialog', { name: 'Agent' }).getByRole('button', { name: /^Plan/ }).click();
  await page.getByRole('button', { name: 'Approvals: Default approvals' }).click();
  const approvals = page.getByRole('dialog', { name: 'Approvals' });
  await approvals.getByRole('button', { name: /^Bypass approvals/ }).click();
  await approvals.getByRole('button', { name: 'Turn on' }).click();

  await message.fill('Add a WebP encoder next to it.');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Done: Add a WebP encoder next to it.')).toBeVisible();
  await expect(page.getByText('Added a PNG encoder.')).toHaveCount(0);
  await expect(page.getByText('There are two encoders now.')).toHaveCount(0);
  await expect(page.getByText('Moved the JPEG encoder into its own module.')).toBeVisible();
  await expect(banner).toHaveCount(0);
  await expect(message).toHaveValue('Unsent draft');
  await expect(page.getByRole('button', { name: 'Plan', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Claude Opus' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approvals: Bypass approvals' })).toBeVisible();
});

test('cancels an edit without changing the chat', async ({ page }) => {
  const message = page.getByRole('textbox', { name: 'Message' });
  await message.fill('Unsent draft');
  await openActions(page, SUMMARY, /^Edit message/);
  await expect(page.getByRole('region', { name: 'Editing message' })).toContainText(
    'Sending removes this message.'
  );
  await page.getByRole('button', { name: 'Claude Opus' }).click();
  await page.getByRole('dialog', { name: 'Model' }).getByRole('button', { name: 'GPT-5' }).click();
  await expect(page.getByRole('contentinfo').getByRole('button', { name: 'GPT-5' })).toBeVisible();

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(message).toHaveValue('Unsent draft');
  await expect(
    page.getByRole('contentinfo').getByRole('button', { name: 'Claude Opus' })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: SUMMARY, exact: true })).toBeVisible();
  await expect(page.getByText('There are two encoders now.')).toBeVisible();
});

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
