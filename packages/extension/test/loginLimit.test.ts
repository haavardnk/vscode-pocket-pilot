import { describe, expect, it, vi } from 'vitest';

import { LoginLimit } from '../src/server/loginLimit';

describe('login limit', () => {
  it('pauses password sign-in for a day after 30 wrong passwords', async () => {
    let now = 0;
    const report = vi.fn();
    const limit = new LoginLimit(report, () => now);
    const wrong = await Promise.all(
      Array.from({ length: 40 }, () => limit.attempt(async () => false))
    );
    expect(wrong.filter((outcome) => outcome === 'wrong')).toHaveLength(30);
    expect(wrong.filter((outcome) => outcome === 'blocked')).toHaveLength(10);
    expect(await limit.attempt(async () => true)).toBe('blocked');
    expect(report).toHaveBeenCalledTimes(1);

    now = 24 * 60 * 60_000 + 1;
    expect(await limit.attempt(async () => true)).toBe('ok');
  });
});
