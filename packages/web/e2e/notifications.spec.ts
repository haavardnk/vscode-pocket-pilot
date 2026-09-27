import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'allow' });

test('opens the chat a tapped notification points to', async ({ page, context }) => {
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

  const [worker] = context.serviceWorkers();
  if (!worker) throw new Error('Service worker not running');
  await worker.evaluate(() => {
    const click = new Event('notificationclick');
    Object.assign(click, {
      notification: { data: { url: '/#/session/w1/s4' }, close: () => undefined },
      waitUntil: () => undefined
    });
    self.dispatchEvent(click);
  });

  await expect(page.getByRole('heading', { level: 1, name: 'Plan the release' })).toBeVisible();
});
