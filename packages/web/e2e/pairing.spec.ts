import { expect, test } from '@playwright/test';

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
