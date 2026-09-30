import { expect, test } from '@playwright/test';

import { signInWithWorker } from './helpers';

test.use({ serviceWorkers: 'allow' });

test('asks to sign in again when the sign-in page expires in an open app', async ({ page }) => {
  await signInWithWorker(page);

  await page.request.post('/__access');

  await expect(page.getByText('Sign in again', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in with GitHub' })).toBeVisible();
  await page.getByRole('link', { name: 'Continue' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('button', { name: 'Code', exact: true })).toBeVisible();
});

test('opens on the sign-in prompt instead of the sign-in page', async ({ page, context }) => {
  await signInWithWorker(page);
  await page.request.post('/__access');
  await page.close();

  const launched = await context.newPage();
  await launched.goto('/');

  await expect(launched.getByText('Sign in again', { exact: true })).toBeVisible();
  await launched.request.get('/__access/done');
  await launched.getByRole('button', { name: 'Try again' }).click();
  await expect(launched.getByRole('button', { name: 'Code', exact: true })).toBeVisible();
});
