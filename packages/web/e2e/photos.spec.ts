import { expect, test } from '@playwright/test';

import { openSession, signIn } from './helpers';

const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const photo = (name: string) => ({
  name,
  mimeType: 'image/png',
  buffer: Buffer.from(PNG, 'base64')
});

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('sends photos with a message and shows them in the chat', async ({ page }) => {
  await openSession(page, 'Plan offline mode');
  await page.getByLabel('Photo files').setInputFiles([photo('a.png'), photo('b.png')]);
  const attached = page.getByRole('list', { name: 'Attached photos' });
  await expect(attached.getByRole('img')).toHaveCount(2);
  await attached.getByRole('button', { name: 'Remove photo 1' }).click();
  await expect(attached.getByRole('img')).toHaveCount(1);

  await page.getByRole('textbox', { name: 'Message' }).fill('What is on this screen?');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Done: What is on this screen?')).toBeVisible();
  await expect(attached).toHaveCount(0);

  await page.getByRole('button', { name: 'View Photo 1' }).click();
  const viewer = page.getByRole('dialog', { name: 'Photo 1' });
  await expect(viewer.getByRole('img', { name: 'Photo 1' })).toBeVisible();
  await viewer.getByRole('button', { name: 'Close photo' }).click();
  await expect(viewer).toHaveCount(0);
});

test('keeps photos when editing and blocks models that cannot read them', async ({ page }) => {
  const question = 'Why does the cluster test time out?';
  await openSession(page, 'Fix flaky cluster test');
  await expect(page.getByRole('button', { name: 'Add photos' })).toBeDisabled();

  await page.getByRole('button', { name: 'View Pasted Image' }).click();
  const viewer = page.getByRole('dialog', { name: 'Pasted Image' });
  await expect(viewer.getByRole('img', { name: 'Pasted Image' })).toBeVisible();
  await viewer.getByRole('button', { name: 'Close photo' }).click();

  await page.getByRole('button', { name: question, exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Message actions' })
    .getByRole('button', { name: /^Edit message/ })
    .click();
  const attached = page.getByRole('list', { name: 'Attached photos' });
  await expect(attached.getByRole('img', { name: 'Photo 1' })).toBeVisible();
  await expect(page.getByText('GPT-5 cannot read photos. Pick another model.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();

  await page.getByRole('button', { name: 'GPT-5' }).click();
  await page
    .getByRole('dialog', { name: 'Model' })
    .getByRole('button', { name: 'Claude Opus' })
    .click();
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(`Done: ${question}`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Photo 1' })).toBeVisible();
});
