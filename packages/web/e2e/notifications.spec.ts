import { expect, test } from '@playwright/test';

import { signInWithWorker } from './helpers';

test.use({ serviceWorkers: 'allow' });

test('opens the chat a tapped notification points to', async ({ page, context }) => {
  await signInWithWorker(page);

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
