import { expect, test, type WebSocketRoute } from '@playwright/test';

import { signIn } from './helpers';

const CONNECTIONS = [
  {
    connection: 'quickTunnel',
    note: /temporary Cloudflare address/,
    down: /restarted with a new address: pair again from VS Code/
  },
  { connection: 'tunnel', note: /your Cloudflare tunnel/, down: /computer is awake/ }
] as const;

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

for (const { connection, note, down } of CONNECTIONS) {
  test(`describes a ${connection} connection in settings`, async ({ page }) => {
    await page.route('**/api/auth', async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, json: { ...(await response.json()), connection } });
    });
    await page.reload();
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByText(note)).toBeVisible();
  });

  test(`explains why VS Code is unreachable through a ${connection}`, async ({ page }) => {
    await page.route('**/api/auth', async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, json: { ...(await response.json()), connection } });
    });
    await page.routeWebSocket('**/ws', (socket) => socket.close());
    await page.reload();
    await expect(page.getByRole('status').filter({ hasText: down })).toBeVisible();
    await page.context().setOffline(true);
    await expect(
      page.getByRole('status').filter({ hasText: 'This phone is offline' })
    ).toBeVisible();
    await page.context().setOffline(false);
  });
}

test('shows the connection banner only when the link stays down', async ({ page }) => {
  await page.addInitScript(() => {
    new MutationObserver(() => {
      if (document.body?.textContent?.includes('Connecting to VS Code'))
        document.documentElement.dataset.flashed = 'true';
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  await page.reload();
  await expect(page.getByRole('link', { name: /Build the phone app/ })).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-flashed');

  await page.routeWebSocket('**/ws', (socket) => socket.close());
  await page.reload();
  await expect(page.getByText(/Can't reach VS Code|Connecting to VS Code/)).toBeVisible();
});

test('explains a version mismatch and recovers after a reload', async ({ page }) => {
  let tamper = true;
  const links: { page: WebSocketRoute; server: WebSocketRoute }[] = [];
  await page.routeWebSocket('**/ws', (socket) => {
    const server = socket.connectToServer();
    server.onMessage((message) => {
      const data = JSON.parse(String(message)) as { windows?: Record<string, unknown>[] };
      for (const window of tamper ? (data.windows ?? []) : []) delete window.terminals;
      socket.send(JSON.stringify(data));
    });
    links.push({ page: socket, server });
  });
  await page.reload();
  await expect(page.getByRole('alert')).toHaveText("Pocket Pilot versions don't match");
  await expect(page.getByText(/Reload every VS Code window/)).toBeVisible();
  await page.evaluate(() => {
    Object.assign(window, { stale: true });
  });
  await page.getByRole('button', { name: 'Reload app' }).click();
  await expect.poll(() => page.evaluate(() => 'stale' in window)).toBe(false);
  await expect(page.getByRole('button', { name: 'Reload app' })).toBeVisible();

  tamper = false;
  await links.at(-1)?.server.close();
  await expect(page.getByRole('link', { name: /Build the phone app/ })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);

  links.at(-1)?.page.send(JSON.stringify({ type: 'incompatibleWindows', names: ['Old window'] }));
  await expect(
    page.getByText('Old window runs a different Pocket Pilot version. Reload that window.')
  ).toBeVisible();
});
