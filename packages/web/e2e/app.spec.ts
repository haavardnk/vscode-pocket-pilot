import { expect, type Page, test } from '@playwright/test';

const BASES: Record<string, string> = {
  latte: 'rgb(239, 241, 245)',
  mocha: 'rgb(30, 30, 46)'
};

const CONNECTIONS = [
  { connection: 'quickTunnel', note: /temporary Cloudflare address/ },
  { connection: 'tunnel', note: /your Cloudflare tunnel/ }
] as const;

async function signIn(page: Page): Promise<void> {
  await page.request.post('/__reset');
  await page.request.post('/api/pair', { data: { code: '123456', deviceName: 'Test phone' } });
  await page.goto('/');
}

async function openSession(page: Page, title: string): Promise<void> {
  await page.getByRole('link', { name: new RegExp(title) }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
}

test.describe('pairing', () => {
  test.beforeEach(async ({ page }) => {
    await page.request.post('/__reset');
  });

  test('pairs with the code from the QR link', async ({ page }) => {
    await page.goto('/#pair=654321');
    await expect(page.getByRole('textbox', { name: 'Pairing code' })).toHaveValue('654321');
    await page.getByRole('button', { name: 'Pair' }).click();
    await expect(page.getByRole('alert')).toHaveText('The code is wrong or expired');
    await page.getByRole('textbox', { name: 'Pairing code' }).fill('123456');
    await page.getByRole('button', { name: 'Pair' }).click();
    await expect(page.getByRole('link', { name: /Build the phone app/ })).toBeVisible();
    await expect(page).toHaveURL(/\/#\/$|\/$/);
  });

  test('signs in with the password', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Password' }).click();
    await page.getByRole('textbox', { name: 'Password' }).fill('correct horse');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('link', { name: /Tune the RAW pipeline/ })).toBeVisible();
  });
});

test.describe('paired', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('uses the Catppuccin theme for the color scheme', async ({ page }, testInfo) => {
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).toBe(BASES[testInfo.project.name]);
  });

  test('filters chats and pull requests by repository', async ({ page }) => {
    const picker = page.getByRole('combobox', { name: 'Repository' });
    await picker.selectOption({ label: 'immich-edit' });
    await expect(page.getByRole('link', { name: /Tune the RAW pipeline/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Build the phone app/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Pull requests' }).click();
    await expect(page.getByRole('link', { name: /perf: faster demosaic/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /feat: add phone app/ })).toHaveCount(0);
    await picker.selectOption({ label: 'All repositories' });
    await expect(page.getByRole('link', { name: /feat: add phone app/ })).toBeVisible();
    await expect(page.getByText('Conflicts')).toBeVisible();
  });

  test('approves a waiting tool', async ({ page }) => {
    await openSession(page, 'Build the phone app');
    await expect(page.getByText('Allow tool?')).toBeVisible();
    await page.getByRole('button', { name: 'Allow' }).click();
    await expect(page.getByText('Tests passed.')).toBeVisible();
    await expect(page.getByText('All done.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stop' })).toHaveCount(0);
  });

  test('queues a message while the agent runs and stops it', async ({ page }) => {
    await openSession(page, 'Build the phone app');
    await page.getByRole('textbox', { name: 'Message' }).fill('Also add tests');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByRole('list', { name: 'Queued messages' })).toContainText(
      'Also add tests'
    );
    await expect(page.getByRole('banner').getByText('Running')).toBeVisible();
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(page.getByText('Stopped')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Queued messages' })).toHaveCount(0);
  });

  test('sends a message to an idle chat', async ({ page }) => {
    await openSession(page, 'Fix flaky cluster test');
    await page.getByRole('textbox', { name: 'Message' }).fill('Try again');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('Done: Try again')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message' })).toHaveValue('');
  });

  test('changes agent, model and thinking effort', async ({ page }) => {
    await openSession(page, 'Fix flaky cluster test');
    await page.getByRole('button', { name: 'Reviewer' }).click();
    await page
      .getByRole('dialog', { name: 'Agent' })
      .getByRole('button', { name: /^Agent/ })
      .click();
    await expect(page.getByRole('button', { name: 'Agent', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'GPT-5' }).click();
    const sheet = page.getByRole('dialog', { name: 'Model' });
    await sheet.getByRole('button', { name: 'Claude Opus' }).click();
    await expect(sheet).toBeHidden();
    await page.getByRole('button', { name: 'Claude Opus' }).click();
    const effort = sheet.getByRole('combobox', { name: 'Thinking effort' });
    await expect(effort).toHaveValue('medium');
    await effort.selectOption('high');
    await expect(effort).toHaveValue('high');
  });

  test('starts a new chat and opens it', async ({ page }) => {
    await page.getByRole('combobox', { name: 'Repository' }).selectOption({ label: 'immich-edit' });
    await page.getByRole('button', { name: 'New chat' }).click();
    await expect(page.getByText('Starts in immich-edit')).toBeVisible();
    await page.getByRole('textbox', { name: 'Message' }).fill('Profile the export');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByRole('heading', { name: 'Profile the export' })).toBeVisible();
    await expect(page.getByText('Done: Profile the export')).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('link', { name: /Profile the export/ })).toBeVisible();
  });

  test('persists the chosen theme', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('combobox', { name: 'Theme' }).selectOption({ label: 'Frappé' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'frappe');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'frappe');
    await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute(
      'content',
      '#303446'
    );
    await expect(page.getByRole('combobox', { name: 'Theme' })).toHaveValue('frappe');
  });

  test('signs out this device', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Sign out this device' }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pair' })).toBeVisible();
  });

  for (const { connection, note } of CONNECTIONS) {
    test(`describes a ${connection} connection in settings`, async ({ page }) => {
      await page.route('**/api/auth', async (route) => {
        const response = await route.fetch();
        await route.fulfill({ response, json: { ...(await response.json()), connection } });
      });
      await page.reload();
      await page.getByRole('button', { name: 'Settings' }).click();
      await expect(page.getByText(note)).toBeVisible();
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
    await expect(page.getByText(/Offline, reconnecting|Connecting to VS Code/)).toBeVisible();
  });

  test('draws the repository menu on an opaque background', async ({ page }) => {
    const background = await page
      .getByRole('combobox', { name: 'Repository' })
      .evaluate((select) => getComputedStyle(select, '::picker(select)').backgroundColor);
    expect(background).toBe(
      await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    );
  });
});
