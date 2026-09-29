import type { CopilotUsage, UsageMeter } from '@pocket-pilot/protocol';
import { describe, expect, it } from 'vitest';

import {
  countLabel,
  premiumMeter,
  progressClass,
  resetLabel,
  usageCaption
} from '../src/lib/usage';

const NOW = Date.UTC(2025, 8, 15, 12);

type ReadyUsage = Extract<CopilotUsage, { state: 'ready' }>;

function meter(kind: UsageMeter['kind'], usedPercent: number, unlimited = false): UsageMeter {
  return { kind, usedPercent, used: unlimited ? null : 3, total: unlimited ? null : 10, unlimited };
}

function ready(meters: UsageMeter[], overage = 0, resetAt: number | null = null): ReadyUsage {
  return {
    state: 'ready',
    plan: 'Pro',
    meters,
    overage: { permitted: true, count: overage },
    resetAt,
    checkedAt: NOW - 5 * 60_000
  };
}

describe('usage', () => {
  it.each([
    [74.9, 'progress progress-success'],
    [75, 'progress progress-warning'],
    [90, 'progress progress-error']
  ])('colours %d%% used as %s', (percent, expected) => {
    expect(progressClass(meter('premium', percent))).toBe(expected);
  });

  it.each<[CopilotUsage | null, UsageMeter | null]>([
    [null, null],
    [{ state: 'needsAccess' }, null],
    [ready([meter('premium', 0, true), meter('chat', 10)]), null],
    [ready([meter('chat', 10), meter('premium', 20)]), meter('premium', 20)]
  ])('finds the limited premium meter', (usage, expected) => {
    expect(premiumMeter(usage)).toEqual(expected);
  });

  it('labels counts only when GitHub sent them', () => {
    expect(countLabel(meter('chat', 30))).toBe('3 of 10');
    expect(countLabel({ ...meter('chat', 30), used: null })).toBeNull();
  });

  it('shows the year only for a reset in another year', () => {
    expect(resetLabel(Date.UTC(2025, 9, 1, 12), NOW)).toBe('Resets 1 Oct');
    expect(resetLabel(Date.UTC(2026, 0, 1, 12), NOW)).toBe('Resets 1 Jan 2026');
  });

  it('summarises overage, reset and freshness', () => {
    const usage = ready([meter('premium', 100)], 7, Date.UTC(2025, 9, 1, 12));
    expect(usageCaption(usage, NOW)).toBe(
      '7 premium requests beyond the plan this month. Resets 1 Oct. Updated 5 minutes ago.'
    );
    expect(usageCaption({ ...usage, overage: null, resetAt: null }, NOW)).toBe(
      'Updated 5 minutes ago.'
    );
  });
});
