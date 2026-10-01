import { type BrowserContext, expect, type Locator, type Page, test } from '@playwright/test';

import { openSession, signInWithWorker } from './helpers';

test.use({ serviceWorkers: 'allow' });

async function tap(context: BrowserContext, url: string): Promise<void> {
  const [worker] = context.serviceWorkers();
  if (!worker) throw new Error('Service worker not running');
  await worker.evaluate((target) => {
    const click = new Event('notificationclick');
    Object.assign(click, {
      notification: { data: { url: target }, close: () => undefined },
      waitUntil: () => undefined
    });
    self.dispatchEvent(click);
  }, url);
}

function planHeading(page: Page): Locator {
  return page.getByRole('heading', { level: 1, name: 'Plan the release' });
}

test('opens the chat a tapped notification points to', async ({ page, context }) => {
  await signInWithWorker(page);
  await openSession(page, 'Fix flaky cluster test');

  await tap(context, '/#/session/w1/s4');

  await expect(planHeading(page)).toBeVisible();
});

test('opens the chat when another window of the app is first in line', async ({
  page,
  context
}) => {
  await signInWithWorker(page);
  await openSession(page, 'Fix flaky cluster test');
  const other = await context.newPage();
  await other.goto('/icon-192.png');
  await other.bringToFront();

  await tap(context, '/#/session/w1/s4');

  await expect(planHeading(page)).toBeVisible();
});

test('opens the chat on return when the navigate message is lost', async ({ page, context }) => {
  await page.addInitScript(() => {
    const listen = ServiceWorkerContainer.prototype.addEventListener;
    ServiceWorkerContainer.prototype.addEventListener = function (
      this: ServiceWorkerContainer,
      ...args: Parameters<typeof listen>
    ) {
      if (args[0] !== 'message') listen.apply(this, args);
    };
  });
  await signInWithWorker(page);
  await openSession(page, 'Fix flaky cluster test');

  await tap(context, '/#/session/w1/s4');

  await expect(async () => {
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(planHeading(page)).toBeVisible({ timeout: 500 });
  }).toPass();
});
