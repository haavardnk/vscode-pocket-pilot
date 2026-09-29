import { expect, test } from '@playwright/test';

import { openSession, signIn } from './helpers';

const BASES: Record<string, string> = {
  latte: 'rgb(239, 241, 245)',
  mocha: 'rgb(30, 30, 46)'
};

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('uses the Catppuccin theme for the color scheme', async ({ page }, testInfo) => {
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).toBe(BASES[testInfo.project.name]);
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

test('shows compact chats without thinking', async ({ page }) => {
  const main = page.getByRole('main');
  await openSession(page, 'Build the phone app');
  await expect(main.getByText('Planning')).toBeVisible();
  await expect(main.getByText('Read App.svelte')).toBeHidden();

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('checkbox', { name: 'Compact chats' }).check();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Compact chats' })).toBeChecked();
  await page.getByRole('button', { name: 'Chats' }).click();
  await openSession(page, 'Build the phone app');
  await expect(main.getByText('Starting with the session list.')).toBeVisible();
  await expect(main.getByText('Planning')).toHaveCount(0);
  await expect(main.getByText('Updated the app shell')).toHaveCount(0);
  await expect(main.getByText('Read App.svelte')).toBeVisible();
  await expect(main.getByRole('link', { name: /App\.svelte/ }).first()).toBeVisible();
  await expect(main.getByText('Run npm test')).toBeVisible();
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
