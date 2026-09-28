import { expect, type Page, test } from '@playwright/test';

import { openSession, openTerminal, scrollGap, signIn } from './helpers';

async function fakeKeyboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const data = (): DOMStringMap => document.documentElement.dataset;
    const visual = new EventTarget();
    Object.defineProperties(visual, {
      width: { get: () => innerWidth },
      height: { get: () => innerHeight - Number(data().keyboard ?? 0) },
      scale: { value: 1 },
      offsetLeft: { value: 0 },
      offsetTop: { get: () => Number(data().pan ?? 0) }
    });
    Object.defineProperty(window, 'visualViewport', { value: visual });
  });
  await page.reload();
}

async function openKeyboard(page: Page, height: number, pan: number): Promise<void> {
  await page.evaluate(
    ([keyboard, offset]) => {
      document.documentElement.dataset.keyboard = String(keyboard);
      document.documentElement.dataset.pan = String(offset);
      visualViewport?.dispatchEvent(new Event('resize'));
    },
    [height, pan]
  );
}

const KEYBOARD_SCREENS = [
  {
    screen: 'terminal',
    tab: 'terminals',
    heading: 'zsh',
    open: (page: Page): Promise<void> => openTerminal(page, 'zsh'),
    input: 'Terminal input',
    follows: true,
    latest: '✖ 1 problem'
  },
  {
    screen: 'chat',
    tab: 'chats',
    heading: 'Build the phone app',
    open: (page: Page): Promise<void> => openSession(page, 'Build the phone app'),
    input: 'Message',
    follows: true,
    latest: null
  },
  {
    screen: 'new chat',
    tab: 'chats',
    heading: 'New chat',
    open: (page: Page): Promise<void> => page.getByRole('button', { name: 'New chat' }).click(),
    input: 'Message',
    follows: false,
    latest: 'Start a chat'
  }
] as const;

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

for (const { screen, tab, heading, open, input, follows, latest } of KEYBOARD_SCREENS) {
  test(`keeps the ${screen} in view above the keyboard`, async ({ page }) => {
    await fakeKeyboard(page);
    await page.setViewportSize({ width: 412, height: 600 });
    await open(page);
    await page.getByRole('textbox', { name: input }).focus();
    await openKeyboard(page, 300, 120);
    const pane = page.locator(`[data-tab="${tab}"]`);
    await expect
      .poll(() =>
        pane.evaluate((element) => {
          const top = visualViewport?.offsetTop ?? 0;
          const bottom = top + (visualViewport?.height ?? innerHeight);
          const header = element.querySelector('header')?.getBoundingClientRect().top ?? NaN;
          const footer = element.querySelector('footer')?.getBoundingClientRect().bottom ?? NaN;
          return Math.max(Math.abs(header - top), Math.abs(bottom - footer));
        })
      )
      .toBeLessThan(2);
    if (follows) await expect.poll(() => scrollGap(pane)).toBeLessThan(2);
    if (latest) {
      const shown = pane.getByText(latest).evaluate((node) => {
        const pane = node.closest('[data-tab]');
        const header = pane?.querySelector('header')?.getBoundingClientRect().bottom ?? NaN;
        const footer = pane?.querySelector('footer')?.getBoundingClientRect().top ?? NaN;
        const rect = node.getBoundingClientRect();
        return rect.top >= header && rect.bottom <= footer;
      });
      expect(await shown).toBe(true);
    }
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expect(page.getByRole('navigation')).toBeHidden();
  });
}
