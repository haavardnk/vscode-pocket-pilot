import { expect, test } from '@playwright/test';

import { MIDDAY_ZONE, openFolder, openSession, signIn } from './helpers';

test.use({ timezoneId: MIDDAY_ZONE });

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('filters chats by repository', async ({ page }) => {
  const picker = page.getByRole('combobox', { name: 'Repository' });
  await picker.selectOption({ label: 'immich-edit' });
  await expect(page.getByRole('link', { name: /Tune the RAW pipeline/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Build the phone app/ })).toHaveCount(0);
  await picker.selectOption({ label: 'All repositories' });
  await expect(page.getByRole('link', { name: /Build the phone app/ })).toBeVisible();
});

test('links chats and folders to GitHub', async ({ page }) => {
  const base = 'https://github.com/haavardnk/vscode-pocket-pilot';
  await openSession(page, 'Fix flaky cluster test');
  const main = page.getByRole('main');
  await expect(main.getByRole('link', { name: '#12' })).toHaveAttribute(
    'href',
    `${base}/issues/12`
  );
  await expect(main.getByRole('link', { name: '3b7d0a2' })).toHaveAttribute(
    'href',
    `${base}/commit/3b7d0a2`
  );
  await expect(main.getByRole('link', { name: '4f2c9e1' })).toHaveAttribute(
    'href',
    `${base}/commit/4f2c9e1`
  );
  await page.getByRole('button', { name: 'Chats' }).click();
  await openFolder(page);
  await page.getByRole('button', { name: 'Open on GitHub' }).click();
  const sheet = page.getByRole('dialog', { name: 'Open on GitHub' });
  await expect(sheet.getByRole('link', { name: /^Repository/ })).toHaveAttribute('href', base);
  await expect(sheet.getByRole('link', { name: /^Branch/ })).toHaveAttribute(
    'href',
    `${base}/tree/feat/web`
  );
  await expect(sheet.getByRole('link', { name: /^Pull requests/ })).toHaveAttribute(
    'href',
    `${base}/pulls?q=is%3Apr%20head%3Afeat%2Fweb`
  );
  await expect(sheet.getByRole('link', { name: /^Commit/ })).toHaveCount(0);
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

test('copies code blocks, commands and responses', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const clipboard = (): Promise<string> => page.evaluate(() => navigator.clipboard.readText());
  await openSession(page, 'Build the phone app');
  const main = page.getByRole('main');
  await main.getByRole('button', { name: 'Copy code' }).click();
  await expect(main.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await clipboard()).toBe('const sessions = [];');
  await expect(main.getByRole('button', { name: 'Copy code' })).toBeVisible();
  await page.getByRole('alert').getByRole('button', { name: 'Copy details' }).click();
  await expect.poll(clipboard).toBe('npm test -- --run');
  await expect(main.getByRole('button', { name: 'Copy response' })).toHaveCount(0);
  await page.goBack();
  await openSession(page, 'Fix flaky cluster test');
  await main.getByRole('button', { name: 'Copy response' }).click();
  await expect
    .poll(clipboard)
    .toBe(
      'The follower retried before the leader was listening. Regressed in 3b7d0a2, fixed in `4f2c9e1`, see #12. Routes live in [routing.ts](packages/web/src/lib/routing.ts#L3).'
    );
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
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
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
  await expect(page.getByRole('list', { name: 'Queued messages' })).toContainText('Also add tests');
  await expect(page.getByRole('banner').getByRole('img', { name: 'Running' })).toBeVisible();
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
  await expect(sheet.getByText('1 attachment will be dropped')).toBeVisible();
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
  await expect(queue.getByRole('img', { name: /attachment/ })).toHaveCount(1);
  await expect(
    row('Draft the announcement').getByRole('img', { name: '1 attachment' })
  ).toBeVisible();
});

test('edits queued messages with their agent, model, approvals and photos', async ({ page }) => {
  await openSession(page, 'Plan the release');
  const queue = page.getByRole('list', { name: 'Queued messages' });
  const row = (text: string) => queue.getByRole('listitem').filter({ hasText: text });
  const message = page.getByRole('textbox', { name: 'Message' });
  const banner = page.getByRole('region', { name: 'Editing queued message' });
  const attached = page.getByRole('list', { name: 'Attached photos' });
  await message.fill('Unsent draft');

  await queue.getByRole('button', { name: 'Draft the announcement' }).click();
  await expect(banner).toBeVisible();
  await expect(row('Draft the announcement')).toHaveAttribute('aria-current', 'true');
  await expect(row('Tag the release').getByRole('button', { name: 'Remove' })).toBeDisabled();
  await expect(message).toHaveValue('Draft the announcement');
  await expect(attached.getByRole('img')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Plan', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approvals: Autopilot' })).toBeVisible();

  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Agent' })
    .getByRole('button', { name: /^Agent/ })
    .click();
  await page.getByRole('button', { name: 'Approvals: Autopilot' }).click();
  await page
    .getByRole('dialog', { name: 'Approvals' })
    .getByRole('button', { name: /^Default approvals/ })
    .click();
  await message.fill('Draft a short announcement');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Drop attachments?' });
  await expect(sheet.getByText('1 attachment will be dropped')).toBeVisible();
  await sheet.getByRole('button', { name: 'Continue' }).click();

  await expect(banner).toHaveCount(0);
  await expect(message).toHaveValue('Unsent draft');
  await expect(queue.getByRole('listitem')).toHaveText([
    /Keep the changelog short/,
    /Draft a short announcement/,
    /Tag the release/
  ]);
  await expect(
    row('Draft a short announcement').getByRole('img', { name: '1 attachment' })
  ).toBeVisible();

  await queue.getByRole('button', { name: 'Draft a short announcement' }).click();
  await expect(page.getByRole('button', { name: 'Agent', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approvals: Default approvals' })).toBeVisible();
  await expect(attached.getByRole('img')).toHaveCount(1);
  await banner.getByRole('button', { name: 'Cancel' }).click();
  await expect(message).toHaveValue('Unsent draft');
  await expect(page.getByRole('button', { name: 'Approvals: Bypass approvals' })).toBeVisible();
});

test('sends steering messages immediately', async ({ page }) => {
  await openSession(page, 'Plan the release');
  const queue = page.getByRole('list', { name: 'Queued messages' });
  await queue
    .getByRole('listitem')
    .filter({ hasText: 'Keep the changelog short' })
    .getByRole('button', { name: 'Send now' })
    .click();
  await expect(page.getByText('Stopped')).toBeVisible();
  await expect(page.getByText('Done: Keep the changelog short')).toBeVisible();
  await expect(queue).not.toContainText('Keep the changelog short');
});

test('switches queued messages between steer and queue while editing', async ({ page }) => {
  await openSession(page, 'Plan the release');
  const queue = page.getByRole('list', { name: 'Queued messages' });
  const delivery = page.getByRole('radiogroup', { name: 'Delivery' });

  await queue.getByRole('button', { name: 'Tag the release' }).click();
  await expect(delivery.getByRole('radio', { name: 'Queue' })).toBeChecked();
  await delivery.getByRole('radio', { name: 'Steer' }).click();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Drop attachments?' })
    .getByRole('button', { name: 'Continue' })
    .click();
  await expect(queue.getByRole('listitem')).toHaveText([
    /Steer\s*Keep the changelog short/,
    /Steer\s*Tag the release/,
    /Queued\s*Draft the announcement/
  ]);

  await queue.getByRole('button', { name: 'Keep the changelog short' }).click();
  await expect(delivery.getByRole('radio', { name: 'Steer' })).toBeChecked();
  await delivery.getByRole('radio', { name: 'Queue' }).click();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(queue.getByRole('listitem')).toHaveText([
    /Steer\s*Tag the release/,
    /Queued\s*Keep the changelog short/,
    /Queued\s*Draft the announcement/
  ]);
});

test('remembers steer for the next message', async ({ page }) => {
  await openSession(page, 'Plan the release');
  const delivery = page.getByRole('radiogroup', { name: 'Delivery' });
  const steer = delivery.getByRole('radio', { name: 'Steer' });

  await page.getByRole('textbox', { name: 'Message' }).fill('Mention the fix');
  await steer.click();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(
    page.getByRole('list', { name: 'Queued messages' }).getByText('Mention the fix')
  ).toBeVisible();
  await expect(steer).toBeChecked();

  await page.reload();
  await expect(steer).toBeChecked();
});

test('removes and collapses queued messages', async ({ page }) => {
  await openSession(page, 'Plan the release');
  const queue = page.getByRole('list', { name: 'Queued messages' });
  const remove = (text: string) =>
    queue.getByRole('listitem').filter({ hasText: text }).getByRole('button', { name: 'Remove' });
  await remove('Draft the announcement').click();
  await expect(queue.getByRole('listitem')).toHaveCount(2);
  await expect(queue).not.toContainText('Draft the announcement');

  await remove('Tag the release').click();
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
  const chats = page.getByRole('main');
  await expect(chats.getByRole('heading')).toHaveText(['Needs input', 'Today']);
  await expect(
    page.getByRole('list', { name: 'Needs input' }).getByRole('link', { name: /Plan the release/ })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Actions for Fix flaky cluster test' }).click();
  await page
    .getByRole('dialog', { name: 'Fix flaky cluster test' })
    .getByRole('button', { name: 'Pin', exact: true })
    .click();
  await expect(chats.getByRole('heading')).toHaveText(['Needs input', 'Pinned', 'Today']);
  await expect(page.getByRole('list', { name: 'Pinned' })).toContainText('Fix flaky cluster test');

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

test('searches chats including archived ones', async ({ page }) => {
  const search = page.getByRole('searchbox', { name: 'Search chats' });
  const results = page.getByRole('list', { name: 'Search results' });
  await search.fill('dependencies');
  await expect(results.getByRole('link')).toHaveCount(1);
  await expect(
    results.getByRole('link', { name: /Bump dependencies/ }).getByRole('img', { name: 'Archived' })
  ).toBeVisible();
  await search.fill('nothing like this');
  await expect(page.getByText('No matching chats')).toBeVisible();
  await search.fill('');
  await expect(results).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Today' })).toBeVisible();
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

test('shows the todo list above the composer', async ({ page }) => {
  await openSession(page, 'Build the phone app');
  const toggle = page.getByRole('button', { name: /^Todos \(1\/3\)/ });
  await expect(toggle).toContainText('Composer with queue');
  await toggle.click();
  const list = page.getByRole('list', { name: 'Todos' });
  await expect(list.getByRole('listitem')).toHaveText([
    'Session list',
    'Composer with queue',
    'Offline banner'
  ]);
  await expect(list.getByRole('img', { name: 'In progress' })).toHaveCount(1);
  await expect(toggle).toHaveText('Todos (1/3)');
});

test('expands a subagent with its tools and result', async ({ page }) => {
  await openSession(page, 'Fix flaky cluster test');
  const result = page.getByText('The follower connects before the leader listens.');
  await expect(result).toBeHidden();
  await page.getByText('Find the election timeout').click();
  await expect(page.getByText('Read cluster.ts')).toBeVisible();
  await expect(page.getByText('Claude Haiku 4.5')).toBeVisible();
  await expect(result).toBeVisible();
});
