import { describe, expect, it } from 'vitest';

import { shortAgo } from '../src/lib/time';

const NOW = new Date(2025, 5, 10, 12).getTime();
const MINUTE = 60_000;

describe('shortAgo', () => {
  it.each([
    [30_000, 'now'],
    [5 * MINUTE, '5m'],
    [3 * 60 * MINUTE, '3h'],
    [2 * 24 * 60 * MINUTE, '2d'],
    [NOW - new Date(2025, 1, 3).getTime(), '3 Feb'],
    [NOW - new Date(2024, 11, 24).getTime(), '24 Dec 2024']
  ])('formats %i ms ago as %s', (elapsed, label) => {
    expect(shortAgo(NOW - elapsed, NOW)).toBe(label);
  });
});
