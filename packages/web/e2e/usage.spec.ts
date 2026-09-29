import { expect, type Page, test } from '@playwright/test';

import { openSession, signIn } from './helpers';

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

function setUsage(page: Page, usage: unknown): Promise<unknown> {
  return page.request.post('/__usage', { data: { usage } });
}

test('shows Copilot usage in settings and updates it live', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  const group = page.getByRole('list', { name: 'Copilot' });
  await expect(group).toContainText('Pro+');
  await expect(group).toContainText('42% used');
  await expect(group).toContainText('630 of 1,500');
  await expect(group).not.toContainText('Chat messages');
  const meter = group.getByRole('progressbar', { name: 'Premium requests' });
  await expect(meter).toHaveAttribute('value', '42');
  await expect(page.getByText(/^Resets \d+ \w+\. Updated 3 minutes ago\.$/)).toBeVisible();

  await setUsage(page, {
    state: 'ready',
    plan: 'Pro',
    meters: [{ kind: 'premium', usedPercent: 93, used: 279, total: 300, unlimited: false }],
    overage: { permitted: true, count: 4 },
    resetAt: null,
    checkedAt: Date.now()
  });
  await expect(group).toContainText('93% used');
  await expect(meter).toHaveClass(/progress-error/);
  await expect(
    page.getByText('4 premium requests beyond the plan this month. Updated just now.')
  ).toBeVisible();
});

test('explains how to allow GitHub access', async ({ page }) => {
  await setUsage(page, { state: 'needsAccess' });
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('list', { name: 'Copilot' })).toContainText('Not allowed yet');
  await expect(page.getByText(/from the Accounts\s+menu in VS Code/)).toBeVisible();
});

test('shows premium usage in the model sheet', async ({ page }) => {
  await openSession(page, 'Fix flaky cluster test');
  await page.getByRole('button', { name: 'GPT-5' }).click();
  const sheet = page.getByRole('dialog', { name: 'Model' });
  await expect(sheet).toContainText(/42% used · Resets \d+ \w+/);
  await expect(sheet.getByRole('progressbar', { name: 'Premium requests' })).toHaveAttribute(
    'value',
    '42'
  );
  await setUsage(page, { state: 'unavailable', reason: 'No Copilot plan on this GitHub account' });
  await expect(sheet.getByRole('progressbar')).toHaveCount(0);
});
