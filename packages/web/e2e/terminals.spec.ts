import { expect, test } from '@playwright/test';

import { openSession, openTerminal, signIn } from './helpers';

const ANSI_REDS: Record<string, string> = {
  latte: 'rgb(210, 15, 57)',
  mocha: 'rgb(243, 139, 168)'
};

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('lists terminals and shows their coloured output', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: 'Terminals', exact: true }).click();
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
    .getByRole('button', { name: /^vscode-pocket-pilot/ })
    .click();
  await expect(page.getByRole('heading', { name: 'zsh' })).toBeVisible();
  const output = page.getByRole('log', { name: 'Terminal output' });
  await expect(output).toHaveText('~/Git/vscode-pocket-pilot $');
  await page.getByRole('textbox', { name: 'Terminal input' }).fill('echo hi');
  await page.getByRole('button', { name: 'Run' }).click();
  await expect(output.getByText('hi', { exact: true })).toBeVisible();
  await expect(page.getByText('Output appears once shell integration')).toHaveCount(0);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('link', { name: /^zsh/ })).toBeVisible();
});

test('keeps home folder terminals outside every repository', async ({ page }) => {
  await page.getByRole('button', { name: 'Terminals', exact: true }).click();
  await page.getByRole('button', { name: 'New terminal' }).click();
  const sheet = page.getByRole('dialog', { name: 'New terminal' });
  await expect(sheet.getByRole('button', { name: /Home folder/ })).toHaveCount(1);
  await sheet.getByRole('button', { name: 'Home folder', exact: true }).click();
  await expect(page.getByRole('log', { name: 'Terminal output' })).toHaveText('~ $');
  await page.getByRole('button', { name: 'Back' }).click();

  const home = page.getByRole('region', { name: 'Home folder' });
  await expect(home.getByRole('link', { name: /^zsh/ })).toBeVisible();
  await page.getByRole('combobox', { name: 'Repository' }).selectOption({ label: 'immich-edit' });
  await expect(home.getByRole('link', { name: /^zsh/ })).toBeVisible();
  await expect(page.getByText('No terminals are open in this window.')).toBeVisible();

  await page.getByRole('button', { name: 'Kill all terminals' }).click();
  const dialog = page.getByRole('dialog', { name: 'Kill all terminals' });
  await expect(dialog).toContainText('Kill 1 terminal?');
  await dialog.getByRole('button', { name: 'Kill all', exact: true }).click();
  await expect(home).toHaveCount(0);
});

test('kills all terminals', async ({ page }) => {
  await page.getByRole('button', { name: 'Terminals', exact: true }).click();
  await page.getByRole('button', { name: 'Kill all terminals' }).click();
  const dialog = page.getByRole('dialog', { name: 'Kill all terminals' });
  await expect(dialog).toContainText('Kill all 3 terminals?');
  await dialog.getByRole('button', { name: 'Kill all', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: 'vscode-pocket-pilot' })
      .getByText('No terminals are open in this window.')
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Kill all terminals' })).toHaveCount(0);
});

test('explains a terminal without shell integration', async ({ page }) => {
  await openTerminal(page, 'bash');
  await expect(page.getByText('Output appears once shell integration')).toBeVisible();
  await expect(page.getByText('No command output yet.')).toBeVisible();
});

test('opens the terminal a chat tool ran in', async ({ page }) => {
  await openSession(page, 'Build the phone app');
  await page.getByRole('button', { name: 'Allow' }).click();
  await page.getByText('Updated the app shell').click();
  await page.getByRole('link', { name: 'Open terminal' }).click();
  await expect(page.getByRole('heading', { name: 'Copilot' })).toBeVisible();
  const run = page.getByRole('region', { name: 'npm test -- --run' });
  await expect(run.getByText('292 tests passed')).toBeInViewport();

  await page.getByRole('link', { name: 'Open chat Build the phone app' }).click();
  await expect(page.getByRole('heading', { name: 'Build the phone app' })).toBeVisible();
});
