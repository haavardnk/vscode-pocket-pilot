import { expect, test } from '@playwright/test';

import { frames, openFolder, openSession, scrollGap, signIn } from './helpers';

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('orders the tabs', async ({ page }) => {
  await expect(page.getByRole('navigation').getByRole('button')).toHaveText([
    'Chats',
    'Terminals',
    'Code',
    'Settings'
  ]);
});

test('never scrolls a tab sideways', async ({ page }) => {
  await openSession(page, 'Fix flaky cluster test');
  await page.getByRole('button', { name: 'Code', exact: true }).click();
  await page.getByRole('button', { name: 'Terminals', exact: true }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  for (const tab of ['chats', 'code', 'terminals', 'settings']) {
    const pane = page.locator(`[data-tab="${tab}"]`);
    await pane.evaluate((element: HTMLElement) => {
      element.hidden = false;
      const wide = document.createElement('div');
      wide.style.width = '200vw';
      wide.style.height = '1px';
      element.firstElementChild?.prepend(wide);
    });
    await pane.hover({ position: { x: 100, y: 200 } });
    await page.mouse.wheel(300, 0);
    await page.waitForTimeout(100);
    expect(await pane.evaluate((element) => element.scrollLeft)).toBe(0);
    await pane.evaluate((element: HTMLElement) => {
      element.hidden = true;
    });
  }
});

test('opens one edit from the chat and returns to the same spot', async ({ page }) => {
  await openSession(page, 'Build the phone app');
  const request = page.locator('[data-request="r1"]');
  await request.getByText('Updated the app shell').click();
  await page.setViewportSize({ width: 412, height: 480 });
  const link = request.getByRole('link', { name: /App\.svelte/ });
  await expect(link).toContainText('+1 −0');
  const pane = page.locator('[data-tab="chats"]');
  const bottom = (): Promise<number> =>
    pane.evaluate((element) => element.scrollHeight - element.clientHeight);
  expect(await bottom()).toBeGreaterThan(250);
  await pane.evaluate(
    (element) =>
      new Promise((resolve) => {
        element.scrollTo({ top: 100 });
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      })
  );
  await link.dispatchEvent('click');
  const added = page.getByTestId('diff').locator('[data-kind="added"]');
  await expect(added).toHaveCount(1);
  await expect(added).toContainText('<Composer bind:value');
  await expect(page.getByTestId('diff')).not.toContainText('import Composer');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Build the phone app' })).toBeVisible();
  await expect(link).toBeVisible();
  await frames(page);
  expect(await pane.evaluate((element) => element.scrollTop)).toBe(100);
});

for (const [where, spot] of [
  ['the same spot', 100],
  ['the bottom', 100_000]
] as const) {
  test(`returns to ${where} after a message's changes`, async ({ page }) => {
    await openSession(page, 'Build the phone app');
    const request = page.locator('[data-request="r1"]');
    await request.getByText('Updated the app shell').click();
    await page.setViewportSize({ width: 412, height: 480 });
    const pane = page.locator('[data-tab="chats"]');
    await pane.evaluate((element, top) => element.scrollTo({ top }), spot);
    await frames(page);
    if (spot === 100) expect(await scrollGap(pane)).toBeGreaterThan(150);
    await request.getByRole('link', { name: 'Files changed (1)' }).dispatchEvent('click');
    await page
      .getByRole('list', { name: 'Changed files' })
      .getByRole('link', { name: /App\.svelte/ })
      .click();
    await expect(page.getByTestId('diff').locator('[data-kind="added"]').first()).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: 'Message changes' })).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(request.getByRole('link', { name: /App\.svelte/ })).toBeAttached();
    await frames(page);
    if (spot === 100) expect(await pane.evaluate((element) => element.scrollTop)).toBe(100);
    else expect(await scrollGap(pane)).toBeLessThan(2);
  });

  test(`returns to ${where} after scrolling the chat's changes`, async ({ page }) => {
    await openSession(page, 'Build the phone app');
    await page.setViewportSize({ width: 412, height: 480 });
    const pane = page.locator('[data-tab="chats"]');
    await frames(page);
    await pane.evaluate((element, top) => element.scrollTo({ top }), spot);
    await frames(page);
    if (spot === 100) expect(await scrollGap(pane)).toBeGreaterThan(150);
    await page.getByRole('banner').getByRole('link', { name: 'Changes (2)' }).click();
    await expect(page.getByRole('heading', { name: 'Changes', exact: true })).toBeVisible();
    await page.locator('main').evaluate((main) => {
      const spacer = document.createElement('div');
      spacer.style.height = '2000px';
      main.append(spacer);
    });
    await pane.evaluate((element) => element.scrollTo({ top: 600 }));
    await frames(page);
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: 'Build the phone app' })).toBeVisible();
    await frames(page);
    if (spot === 100) expect(await pane.evaluate((element) => element.scrollTop)).toBe(100);
    else expect(await scrollGap(pane)).toBeLessThan(2);
  });
}

test('stays at the bottom while earlier messages grow', async ({ page }) => {
  await openSession(page, 'Build the phone app');
  const grow = (height: number): Promise<void> =>
    page.evaluate((px) => {
      const spacer = document.createElement('div');
      spacer.style.height = `${px}px`;
      document.querySelector('[data-request="r1"]')?.append(spacer);
    }, height);
  const pane = page.locator('[data-tab="chats"]');
  await grow(1500);
  await expect.poll(() => scrollGap(pane)).toBeLessThan(2);
  await pane.evaluate((element) => element.scrollTo({ top: 0 }));
  await frames(page);
  await grow(500);
  await frames(page);
  expect(await pane.evaluate((element) => element.scrollTop)).toBe(0);
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
  await expect(page.getByRole('link', { name: 'vscode-pocket-pilot', exact: true })).toBeVisible();
});

test('draws the repository menu on an opaque background', async ({ page }) => {
  const background = await page
    .getByRole('combobox', { name: 'Repository' })
    .evaluate((select) => getComputedStyle(select, '::picker(select)').backgroundColor);
  expect(background).toBe(
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  );
});
