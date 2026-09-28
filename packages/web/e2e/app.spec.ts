import { expect, type Page, test, type WebSocketRoute } from '@playwright/test';

const BASES: Record<string, string> = {
  latte: 'rgb(239, 241, 245)',
  mocha: 'rgb(30, 30, 46)'
};

const KEYWORDS: Record<string, string> = {
  latte: 'rgb(136, 57, 239)',
  mocha: 'rgb(203, 166, 247)'
};

const ANSI_REDS: Record<string, string> = {
  latte: 'rgb(210, 15, 57)',
  mocha: 'rgb(243, 139, 168)'
};

const CONNECTIONS = [
  {
    connection: 'quickTunnel',
    note: /temporary Cloudflare address/,
    down: /restarted with a new address: pair again from VS Code/
  },
  { connection: 'tunnel', note: /your Cloudflare tunnel/, down: /computer is awake/ }
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

async function openFolder(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Code' }).click();
  await page.getByRole('link', { name: 'vscode-pocket-pilot', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'vscode-pocket-pilot' })).toBeVisible();
}

async function openTerminal(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Terminals' }).click();
  await page.getByRole('link', { name: new RegExp(`^${name}`) }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
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

  test('orders the tabs', async ({ page }) => {
    await expect(page.getByRole('navigation').getByRole('button')).toHaveText([
      'Chats',
      'Terminals',
      'Code',
      'Pull requests',
      'Settings'
    ]);
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
    await expect(page.getByRole('alert').getByText('npm test -- --run')).toBeVisible();
    await page.getByRole('button', { name: 'Allow' }).click();
    await expect(page.getByText('Tests passed.')).toBeVisible();
    await expect(page.getByText('All done.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stop' })).toHaveCount(0);
  });

  test('answers the questions the agent asks', async ({ page }) => {
    await openSession(page, 'Plan the release');
    const card = page.getByRole('region', { name: 'Questions from the agent' });
    await expect(card.getByRole('radio', { name: 'Stable' })).toBeChecked();
    await card.getByRole('radio', { name: 'Preview' }).check();
    await card.getByRole('checkbox', { name: 'Linux' }).check();
    await card.getByRole('textbox', { name: 'Release notes' }).fill('Faster sync');
    await card.getByRole('button', { name: 'Submit answers' }).click();
    await expect(page.getByText('Thanks, planning now.')).toBeVisible();
    await expect(card.getByText('Preview', { exact: true })).toBeVisible();
    await expect(card.getByText('Faster sync')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Submit answers' })).toHaveCount(0);
  });

  test('answers a confirmation', async ({ page }) => {
    await openSession(page, 'Tune the RAW pipeline');
    await expect(page.getByText('Continue to iterate?')).toBeVisible();
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByText('Done: Pause: "Continue to iterate?"')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pause' })).toHaveCount(0);
  });

  test('changes the approval level after a warning', async ({ page }) => {
    await openSession(page, 'Fix flaky cluster test');
    await page.getByRole('button', { name: 'Approvals: Default approvals' }).click();
    const sheet = page.getByRole('dialog', { name: 'Approvals' });
    await sheet.getByRole('button', { name: /^Bypass approvals/ }).click();
    await expect(sheet.getByText('Turn on Bypass approvals?')).toBeVisible();
    await sheet.getByRole('button', { name: 'Turn on' }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole('button', { name: 'Approvals: Bypass approvals' })).toBeVisible();
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

  test('reorders queued messages after warning about attachments', async ({ page }) => {
    await openSession(page, 'Plan the release');
    const queue = page.getByRole('list', { name: 'Queued messages' });
    const row = (text: string) => queue.getByRole('listitem').filter({ hasText: text });
    await expect(queue.getByRole('listitem')).toHaveText([
      /Keep the changelog short/,
      /Draft the announcement/,
      /Tag the release/
    ]);
    await expect(
      row('Draft the announcement').getByRole('img', { name: '2 attachments' })
    ).toBeVisible();
    await expect(
      row('Keep the changelog short').getByRole('button', { name: 'Move down' })
    ).toBeDisabled();
    await expect(
      row('Draft the announcement').getByRole('button', { name: 'Move up' })
    ).toBeDisabled();

    await row('Tag the release').getByRole('button', { name: 'Move up' }).click();
    const sheet = page.getByRole('dialog', { name: 'Drop attachments?' });
    await expect(sheet.getByText('2 attachments will be dropped')).toBeVisible();
    await sheet.getByRole('button', { name: 'Cancel' }).click();
    await expect(sheet).toBeHidden();
    await expect(queue.getByRole('listitem').nth(1)).toContainText('Draft the announcement');

    await row('Tag the release').getByRole('button', { name: 'Move up' }).click();
    await sheet.getByRole('button', { name: 'Continue' }).click();
    await expect(sheet).toBeHidden();
    await expect(queue.getByRole('listitem')).toHaveText([
      /Keep the changelog short/,
      /Tag the release/,
      /Draft the announcement/
    ]);
    await expect(queue.getByRole('img', { name: /attachment/ })).toHaveCount(0);
  });

  test('edits, removes and collapses queued messages', async ({ page }) => {
    await openSession(page, 'Plan the release');
    const queue = page.getByRole('list', { name: 'Queued messages' });
    await queue.getByRole('button', { name: 'Keep the changelog short' }).click();
    const sheet = page.getByRole('dialog', { name: 'Queued message' });
    await sheet.getByRole('textbox', { name: 'Queued message' }).fill('Keep the changelog tiny');
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('dialog', { name: 'Drop attachments?' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(queue.getByRole('listitem').first()).toContainText('Keep the changelog tiny');

    await queue.getByRole('button', { name: 'Draft the announcement' }).click();
    await sheet.getByRole('button', { name: 'Remove' }).click();
    await expect(sheet).toBeHidden();
    await expect(queue.getByRole('listitem')).toHaveCount(2);
    await expect(queue).not.toContainText('Draft the announcement');

    await queue
      .getByRole('listitem')
      .filter({ hasText: 'Tag the release' })
      .getByRole('button', { name: 'Remove' })
      .click();
    await expect(queue.getByRole('listitem')).toHaveCount(1);
    await expect(queue).not.toContainText('Tag the release');

    const toggle = page.getByRole('button', { name: 'Queued (1)' });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(queue).toHaveCount(0);
    await toggle.click();
    await expect(queue.getByRole('listitem')).toHaveCount(1);
  });

  test('sends a message to an idle chat', async ({ page }) => {
    await openSession(page, 'Fix flaky cluster test');
    await page.getByRole('textbox', { name: 'Message' }).fill('Try again');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByLabel('Sending')).toHaveText('Try again');
    const working = page.getByRole('main').getByRole('status');
    await expect(working).toHaveText('Working');
    const request = page.locator('article').last();
    await expect(request.getByRole('img', { name: 'Running' })).toBeVisible();
    await expect(page.getByLabel('Sending')).toHaveCount(0);
    await expect(page.getByText('Done: Try again')).toBeVisible();
    await expect(request.getByRole('img', { name: 'Done' })).toBeVisible();
    await expect(working).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Message' })).toHaveValue('');
  });

  test('pins, archives and unarchives chats', async ({ page }) => {
    const chats = page.getByRole('list', { name: 'Chats' });
    await page.getByRole('button', { name: 'Actions for Fix flaky cluster test' }).click();
    await page
      .getByRole('dialog', { name: 'Fix flaky cluster test' })
      .getByRole('button', { name: 'Pin', exact: true })
      .click();
    await expect(chats.getByRole('listitem').first()).toHaveText('Pinned');
    await expect(chats.getByRole('listitem').nth(1)).toContainText('Fix flaky cluster test');

    await openSession(page, 'Plan the release');
    await page.getByRole('button', { name: 'Chat actions' }).click();
    await page
      .getByRole('dialog', { name: 'Plan the release' })
      .getByRole('button', { name: 'Archive', exact: true })
      .click();
    await expect(chats.getByRole('link', { name: /Build the phone app/ })).toBeVisible();
    await expect(chats.getByRole('link', { name: /Plan the release/ })).toHaveCount(0);

    await page.getByRole('button', { name: 'Archived (2)' }).click();
    const archived = page.getByRole('list', { name: 'Archived chats' });
    await expect(archived.getByRole('link', { name: /Plan the release/ })).toBeVisible();
    await page.getByRole('button', { name: 'Actions for Bump dependencies' }).click();
    await page
      .getByRole('dialog', { name: 'Bump dependencies' })
      .getByRole('button', { name: 'Unarchive' })
      .click();
    await expect(chats.getByRole('link', { name: /Bump dependencies/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Archived (1)' })).toBeVisible();
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

  test('turns on notifications and sends a test', async ({ page }) => {
    await page.addInitScript(() => {
      const endpoint = 'https://fcm.googleapis.com/fcm/send/e2e';
      let permission: NotificationPermission = 'default';
      let subscription: object | null = null;
      const pushManager = {
        getSubscription: () => Promise.resolve(subscription),
        subscribe: () => {
          subscription = {
            endpoint,
            options: { applicationServerKey: null },
            toJSON: () => ({ endpoint, keys: { p256dh: 'p256dh', auth: 'auth' } }),
            unsubscribe: () => {
              subscription = null;
              return Promise.resolve(true);
            }
          };
          return Promise.resolve(subscription);
        }
      };
      const registration = { pushManager };
      Object.defineProperty(navigator, 'serviceWorker', {
        value: {
          ready: Promise.resolve(registration),
          getRegistration: () => Promise.resolve(registration),
          register: () => Promise.resolve(registration),
          addEventListener: () => undefined
        }
      });
      Object.defineProperty(window, 'PushManager', { value: class {} });
      Object.defineProperty(window, 'Notification', {
        value: {
          get permission() {
            return permission;
          },
          requestPermission: () => {
            permission = 'granted';
            return Promise.resolve(permission);
          }
        }
      });
    });
    await page.reload();
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('checkbox', { name: 'Notify this device' }).check();
    await expect(page.getByRole('checkbox', { name: 'Agent finished' })).toBeChecked();
    await page.getByRole('checkbox', { name: 'Agent needs input' }).uncheck();
    await expect(page.getByRole('checkbox', { name: 'Agent needs input' })).not.toBeChecked();
    await page.getByRole('button', { name: 'Send test notification' }).click();
    await expect(page.getByRole('button', { name: 'Test notification sent' })).toBeVisible();

    const state = (await (await page.request.get('/__push')).json()) as {
      pushes: { subscription: { endpoint: string }; events: Record<string, boolean> }[];
      pushTests: string[];
    };
    expect(state.pushes).toEqual([
      {
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/e2e',
          keys: expect.anything()
        },
        events: { finished: true, needsInput: false, failed: true }
      }
    ]);
    expect(state.pushTests).toHaveLength(1);

    await page.getByRole('checkbox', { name: 'Notify this device' }).uncheck();
    await expect(page.getByRole('checkbox', { name: 'Agent finished' })).toHaveCount(0);
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

  test('browses the repository and highlights a file', async ({ page }, testInfo) => {
    await openFolder(page);
    const files = page.getByRole('list', { name: 'Files' });
    await expect(files.getByRole('link', { name: /node_modules/ })).toBeVisible();
    for (const name of ['packages', 'web', 'src']) await files.getByRole('link', { name }).click();
    await files.getByRole('link', { name: 'App.svelte' }).click();
    await expect(page.getByRole('heading', { name: 'App.svelte' })).toBeVisible();
    const code = page.getByTestId('code');
    await expect(code).toContainText('import SessionList');
    const keyword = code.locator('.code-tokens span', { hasText: /^import$/ }).first();
    await expect(keyword).toHaveCSS('color', KEYWORDS[testInfo.project.name] ?? '');
    const wrap = page.getByRole('button', { name: 'Wrap lines' });
    await wrap.click();
    await expect(wrap).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('banner').getByText('packages/web/src')).toBeVisible();
    await expect(files.getByRole('link', { name: 'App.svelte' })).toBeVisible();
  });

  test('reviews uncommitted changes', async ({ page }) => {
    await openFolder(page);
    await page.getByRole('tab', { name: 'Changes' }).click();
    const changes = page.getByRole('list', { name: 'Changed files' });
    await expect(changes.getByRole('link')).toHaveCount(3);
    await changes.getByRole('link', { name: /routing\.ts/ }).click();
    const diff = page.getByTestId('diff');
    await expect(diff.locator('[data-kind="removed"]')).toContainText(
      "export type Route = { name: 'chats' };"
    );
    await expect(diff.locator('[data-kind="added"]')).toContainText("{ name: 'code' }");
    await page.getByRole('link', { name: 'Open file' }).click();
    await expect(page.getByTestId('code')).toContainText('export function parseRoute');
  });

  test('keeps and undoes the edits of a chat', async ({ page }) => {
    await openSession(page, 'Build the phone app');
    await page.getByRole('link', { name: 'Changes (2)' }).click();
    await page
      .getByRole('list', { name: 'Changed files' })
      .getByRole('link', { name: /App\.svelte/ })
      .click();
    await expect(page.getByTestId('diff').locator('[data-kind="added"]').first()).toContainText(
      'import Composer'
    );
    await page.getByRole('button', { name: 'Keep' }).click();
    await expect(page.getByText('Kept')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Keep' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByText(/Compared with the last commit/)).toBeVisible();
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Undo all' }).click();
    const changes = page.getByRole('list', { name: 'Changed files' });
    await expect(changes.getByText('Undone')).toBeVisible();
    await expect(changes.getByText('Kept')).toBeVisible();
    await expect(page.getByRole('button', { name: /Keep all/ })).toHaveCount(0);
  });

  test('shows the files one message changed', async ({ page }) => {
    await openSession(page, 'Build the phone app');
    const request = page.locator('[data-request="r1"]');
    await expect(request.getByRole('img', { name: 'Done' })).toBeVisible();
    await expect(request.getByRole('img', { name: 'Running' })).toBeVisible();
    await request.getByRole('link', { name: 'Files changed (1)' }).click();
    await expect(page.getByRole('heading', { name: 'Message changes' })).toBeVisible();
    const changes = page.getByRole('list', { name: 'Changed files' });
    await expect(changes.getByRole('link')).toHaveCount(1);
    await changes.getByRole('link', { name: /App\.svelte/ }).click();
    await expect(page.getByTestId('diff').locator('[data-kind="added"]').first()).toContainText(
      'import Composer'
    );
    await expect(page.getByRole('button', { name: 'Keep' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: 'Message changes' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Keep all/ })).toHaveCount(0);
  });

  test('keeps each tab where it was left', async ({ page }) => {
    const tabs = page.getByRole('navigation');
    await openSession(page, 'Build the phone app');
    await expect(tabs).toBeVisible();
    const message = page.getByRole('textbox', { name: 'Message' });
    await message.fill('Half-written draft');
    await expect(tabs).toBeHidden();
    await message.blur();

    await openFolder(page);
    await tabs.getByRole('button', { name: 'Chats' }).click();
    await expect(page.getByRole('heading', { name: 'Build the phone app' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message' })).toHaveValue('Half-written draft');

    await tabs.getByRole('button', { name: 'Code' }).click();
    await expect(page.getByRole('heading', { name: 'vscode-pocket-pilot' })).toBeVisible();
    await tabs.getByRole('button', { name: 'Code' }).click();
    await expect(
      page.getByRole('link', { name: 'vscode-pocket-pilot', exact: true })
    ).toBeVisible();
  });

  test('draws the repository menu on an opaque background', async ({ page }) => {
    const background = await page
      .getByRole('combobox', { name: 'Repository' })
      .evaluate((select) => getComputedStyle(select, '::picker(select)').backgroundColor);
    expect(background).toBe(
      await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    );
  });

  test('lists terminals and shows their coloured output', async ({ page }, testInfo) => {
    await page.getByRole('button', { name: 'Terminals' }).click();
    await expect(page.getByRole('link', { name: /^Copilot.*Build the phone app/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /^zsh.*Exit 1/ })).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'immich-edit' })
        .getByText('No terminals are open in this window.')
    ).toBeVisible();

    await openTerminal(page, 'zsh');
    const status = page.getByRole('region', { name: 'git status' });
    await expect(status.getByRole('img', { name: 'Succeeded' })).toBeVisible();
    await expect(status.locator('span', { hasText: 'modified:' })).toHaveCSS(
      'color',
      ANSI_REDS[testInfo.project.name] ?? ''
    );
    await expect(page.getByRole('region', { name: 'npm run lint' })).toContainText('Exit 1');
  });

  test('runs a command in a terminal and interrupts it', async ({ page }) => {
    await openTerminal(page, 'zsh');
    const input = page.getByRole('textbox', { name: 'Terminal input' });
    await input.fill('npm run dev');
    await page.getByRole('button', { name: 'Run' }).click();
    await expect(input).toHaveValue('');
    const dev = page.getByRole('region', { name: 'npm run dev' });
    await expect(dev.getByText('VITE ready in 312 ms')).toBeVisible();
    await expect(dev.getByRole('img', { name: 'Running' })).toBeVisible();

    await page.getByRole('button', { name: 'Ctrl+C' }).click();
    await expect(dev).toContainText('Exit 130');
    await expect(dev.getByText('^C')).toBeVisible();

    await input.fill('ls');
    await page.getByRole('button', { name: 'Run' }).click();
    await expect(
      page.getByRole('region', { name: 'ls', exact: true }).getByRole('img', { name: 'Succeeded' })
    ).toBeVisible();
  });

  test('kills a terminal and opens a new one', async ({ page }) => {
    await openTerminal(page, 'zsh');
    await page.getByRole('button', { name: 'Kill terminal' }).click();
    await page
      .getByRole('dialog', { name: 'Kill terminal' })
      .getByRole('button', { name: 'Kill', exact: true })
      .click();
    await expect(page.getByRole('link', { name: /^Copilot/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /^zsh/ })).toHaveCount(0);

    await page.getByRole('button', { name: 'New terminal' }).click();
    await page
      .getByRole('dialog', { name: 'New terminal' })
      .getByRole('button', { name: /vscode-pocket-pilot/ })
      .click();
    await expect(page.getByRole('heading', { name: 'zsh' })).toBeVisible();
    await expect(page.getByText('No command output yet.')).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('link', { name: /^zsh/ })).toBeVisible();
  });

  test('opens the terminal a chat tool ran in', async ({ page }) => {
    await openSession(page, 'Build the phone app');
    await page.getByRole('button', { name: 'Allow' }).click();
    await page.getByRole('link', { name: 'Open terminal' }).click();
    await expect(page.getByRole('heading', { name: 'Copilot' })).toBeVisible();
    const run = page.getByRole('region', { name: 'npm test -- --run' });
    await expect(run.getByText('292 tests passed')).toBeInViewport();

    await page.getByRole('link', { name: 'Open chat Build the phone app' }).click();
    await expect(page.getByRole('heading', { name: 'Build the phone app' })).toBeVisible();
  });
});
