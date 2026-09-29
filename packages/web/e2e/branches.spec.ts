import { expect, type Page, test } from '@playwright/test';

import { openFolder, signIn } from './helpers';

async function openBranches(page: Page): Promise<void> {
  await openFolder(page);
  await page.getByRole('link', { name: 'Branches' }).click();
  await expect(page.getByRole('heading', { name: 'Branches' })).toBeVisible();
}

function local(page: Page) {
  return page.getByRole('list', { name: 'Local branches' });
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('switches branches after warning about active chats', async ({ page }) => {
  await openBranches(page);
  await expect(local(page).getByRole('button', { name: 'feat/web' })).toHaveAttribute(
    'aria-current',
    'true'
  );
  await local(page).getByRole('button', { name: 'main' }).click();
  const sheet = page.getByRole('dialog', { name: 'Switch to main?' });
  await expect(sheet.getByRole('alert')).toContainText('2 chats are still active');
  await expect(sheet).toContainText('3 files have uncommitted changes');
  await sheet.getByRole('button', { name: 'Cancel' }).click();
  await expect(sheet).toBeHidden();
  await expect(local(page).getByRole('button', { name: 'feat/web' })).toHaveAttribute(
    'aria-current',
    'true'
  );

  await local(page).getByRole('button', { name: 'main' }).click();
  await sheet.getByRole('button', { name: 'Bring changes along' }).click();
  await expect(page.getByText('Switched to main')).toBeVisible();
  await expect(local(page).getByRole('button', { name: 'main' })).toHaveAttribute(
    'aria-current',
    'true'
  );
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('link', { name: 'Branches' })).toContainText('main');
  await expect(page.getByRole('link', { name: 'Branches' })).toContainText('3 changed');
});

test('offers the stash when changes conflict', async ({ page }) => {
  await openBranches(page);
  const sheet = page.getByRole('dialog', { name: 'Switch to feat/conflict?' });
  await local(page).getByRole('button', { name: 'feat/conflict' }).click();
  await sheet.getByRole('button', { name: 'Bring changes along' }).click();
  await expect(page.getByText('uncommitted changes conflict')).toBeVisible();

  await local(page).getByRole('button', { name: 'feat/conflict' }).click();
  await sheet.getByRole('button', { name: 'Stash and switch' }).click();
  await expect(page.getByText('Switched to feat/conflict')).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('link', { name: 'Branches' })).not.toContainText('changed');
});

test('tracks a remote-only branch locally', async ({ page }) => {
  await openBranches(page);
  const remote = page.getByRole('list', { name: 'Remote branches' });
  await remote.getByRole('button', { name: 'origin/feat/branches' }).click();
  await page
    .getByRole('dialog', { name: 'Switch to feat/branches?' })
    .getByRole('button', { name: 'Bring changes along' })
    .click();
  await expect(local(page).getByRole('button', { name: 'feat/branches' })).toHaveAttribute(
    'aria-current',
    'true'
  );
  await expect(remote.getByRole('button', { name: 'origin/feat/branches' })).toBeHidden();
});

test('switches a clean idle window without asking', async ({ page }) => {
  await page.goto('/#/branches/w2/f2');
  await local(page).getByRole('button', { name: 'main' }).click();
  await expect(page.getByText('Switched to main')).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('refuses branches checked out in another worktree', async ({ page }) => {
  await openBranches(page);
  const branch = local(page).getByRole('button', { name: 'fix/sw' });
  await expect(branch).toBeDisabled();
  await expect(branch).toContainText('Checked out in /Users/me/Git/pocket-pilot-sw');
});

test('creates a branch with a valid name', async ({ page }) => {
  await openBranches(page);
  await page.getByRole('button', { name: 'New branch' }).click();
  const sheet = page.getByRole('dialog', { name: 'New branch' });
  await expect(sheet).toContainText('Starts from feat/web');
  const name = sheet.getByRole('textbox', { name: 'Branch name' });
  const create = sheet.getByRole('button', { name: 'Create and switch' });
  for (const invalid of ['has space', '-rf', 'a..b', 'x.lock']) {
    await name.fill(invalid);
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(create).toBeDisabled();
  }
  await name.fill('main');
  await create.click();
  await expect(page.getByText('A branch with this name already exists')).toBeVisible();
  await name.fill('feat/phone');
  await create.click();
  await expect(page.getByText('Switched to new branch feat/phone')).toBeVisible();
  await expect(sheet).toBeHidden();
  await expect(local(page).getByRole('button', { name: 'feat/phone' })).toHaveAttribute(
    'aria-current',
    'true'
  );
});

test('fetches and searches branches', async ({ page }) => {
  await openBranches(page);
  const search = page.getByRole('searchbox', { name: 'Search branches' });
  await search.fill('fetched');
  await expect(page.getByText('No matching branches')).toBeVisible();
  await page.getByRole('button', { name: 'Fetch from remotes' }).click();
  await expect(page.getByRole('list', { name: 'Remote branches' }).getByRole('button')).toHaveText([
    /origin\/feat\/fetched/
  ]);
  await search.fill('');
  await expect(local(page).getByRole('button')).toHaveCount(4);
});
