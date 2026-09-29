import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

test('replaces a crashed screen with a way to reload', async ({ page }) => {
  await signIn(page);
  let tamper = true;
  await page.routeWebSocket('**/ws', (socket) => {
    const server = socket.connectToServer();
    server.onMessage((message) => {
      const data = JSON.parse(String(message)) as {
        windows?: { sessions: { updatedAt: number }[] }[];
      };
      const session = tamper ? data.windows?.[0]?.sessions[0] : undefined;
      if (session) session.updatedAt = 1e20;
      socket.send(JSON.stringify(data));
    });
  });
  await page.reload();

  await expect(page.getByText('Pocket Pilot stopped')).toBeVisible();
  tamper = false;
  await page.getByRole('button', { name: 'Reload' }).click();
  await expect(page.getByRole('link', { name: /Build the phone app/ })).toBeVisible();
});

test('explains an app that never starts', async ({ page }) => {
  await signIn(page);
  await page.route('**/assets/index-*.js', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>app</title>' })
  );
  await page.reload();

  await expect(page.getByText("Pocket Pilot didn't start")).toBeVisible({ timeout: 10_000 });
  await page.unrouteAll();
  await page.getByRole('link', { name: 'Reload' }).click();
  await expect(page.getByRole('link', { name: /Build the phone app/ })).toBeVisible();
  await expect(page.getByText("Pocket Pilot didn't start")).toHaveCount(0);
});
