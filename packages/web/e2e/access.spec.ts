import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'allow' });

test('reloads into a sign-in page put in front of the tunnel', async ({ page }) => {
  await page.request.post('/__reset');
  await page.request.post('/api/pair', { data: { code: '123456', deviceName: 'Test phone' } });
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
  await expect(page.getByRole('button', { name: 'Code' })).toBeVisible();

  await page.request.post('/__access');

  await expect(page.getByRole('heading', { name: 'Sign in with GitHub' })).toBeVisible();
});
