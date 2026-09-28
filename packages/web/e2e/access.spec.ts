import { expect, test } from '@playwright/test';

import { signInWithWorker } from './helpers';

test.use({ serviceWorkers: 'allow' });

test('reloads into a sign-in page put in front of the tunnel', async ({ page }) => {
  await signInWithWorker(page);

  await page.request.post('/__access');

  await expect(page.getByRole('heading', { name: 'Sign in with GitHub' })).toBeVisible();
});
