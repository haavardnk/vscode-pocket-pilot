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
