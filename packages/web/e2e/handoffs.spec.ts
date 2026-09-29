import { expect, test } from '@playwright/test';

import { openSession, signIn } from './helpers';

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await openSession(page, 'Plan offline mode');
});

test('hands a plan off to the agent', async ({ page }) => {
  const next = page.getByRole('region', { name: 'Proceed from Plan' });
  await expect(page.getByRole('button', { name: 'Plan', exact: true })).toBeVisible();
  await next.getByRole('button', { name: 'Start Implementation' }).click();
  await expect(page.getByLabel('Sending')).toHaveText('Start implementation');
  await expect(next).toHaveCount(0);
  await expect(page.getByText('Done: Start implementation')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Agent', exact: true })).toBeVisible();
  await expect(next).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Approvals: Default approvals' })).toBeVisible();
});

test('starts a plan with autopilot', async ({ page }) => {
  await page
    .getByRole('region', { name: 'Proceed from Plan' })
    .getByRole('button', { name: 'Start with Autopilot' })
    .click();
  await expect(page.getByRole('button', { name: 'Approvals: Autopilot' })).toBeVisible();
  await expect(page.getByText('Done: Start implementation')).toBeVisible();
});

test('prefills a handoff that is not sent', async ({ page }) => {
  const next = page.getByRole('region', { name: 'Proceed from Plan' });
  await next.getByRole('button', { name: 'Refine the Plan' }).click();
  const message = page.getByRole('textbox', { name: 'Message' });
  await expect(message).toHaveValue('Refine the plan: ');
  await expect(message).toBeFocused();
  await expect(page.getByLabel('Sending')).toHaveCount(0);
  await expect(next).toBeVisible();
});
