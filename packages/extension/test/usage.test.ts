import type { CopilotUsage, SessionSummary, WindowState } from '@pocket-pilot/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseEntitlements } from '../src/usage/entitlements';
import { UsageFeed, type UsageReader } from '../src/usage/usageFeed';

const NOW = 1_758_000_000_000;
const OCTOBER = Date.UTC(2025, 9, 1);
const UNLIMITED = {
  percent_remaining: 100,
  unlimited: true,
  entitlement: 0,
  quota_remaining: 0,
  quota_reset_at: 0
};

describe('parseEntitlements', () => {
  it.each<[string, unknown, Partial<CopilotUsage>]>([
    [
      'Pro',
      {
        copilot_plan: 'individual',
        quota_reset_date_utc: '2025-10-01T00:00:00.000Z',
        quota_snapshots: {
          premium_interactions: {
            percent_remaining: 80,
            unlimited: false,
            entitlement: 300,
            quota_remaining: 240,
            overage_count: 0,
            overage_permitted: false,
            quota_reset_at: 0
          },
          chat: UNLIMITED,
          completions: UNLIMITED
        }
      },
      {
        plan: 'Pro',
        meters: [
          { kind: 'premium', usedPercent: 20, used: 60, total: 300, unlimited: false },
          { kind: 'chat', usedPercent: 0, used: null, total: null, unlimited: true },
          { kind: 'completions', usedPercent: 0, used: null, total: null, unlimited: true }
        ],
        overage: { permitted: false, count: 0 },
        resetAt: OCTOBER
      }
    ],
    [
      'Pro+ over quota with the snapshot reset winning',
      {
        copilot_plan: 'individual_pro',
        quota_reset_date: '2025-11-01',
        quota_snapshots: {
          premium_interactions: {
            percent_remaining: -4,
            unlimited: false,
            entitlement: 1500,
            remaining: 0,
            overage_count: 12,
            overage_permitted: true,
            quota_reset_at: OCTOBER / 1000
          }
        }
      },
      {
        plan: 'Pro+',
        meters: [{ kind: 'premium', usedPercent: 100, used: 1500, total: 1500, unlimited: false }],
        overage: { permitted: true, count: 12 },
        resetAt: OCTOBER
      }
    ],
    [
      'legacy Free',
      {
        copilot_plan: 'individual',
        access_type_sku: 'free_limited_copilot',
        limited_user_reset_date: '2025-10-01',
        monthly_quotas: { chat: 50, completions: 2000 },
        limited_user_quotas: { chat: 40, completions: 1500 }
      },
      {
        plan: 'Free',
        meters: [
          { kind: 'chat', usedPercent: 20, used: 10, total: 50, unlimited: false },
          { kind: 'completions', usedPercent: 25, used: 500, total: 2000, unlimited: false }
        ],
        overage: null,
        resetAt: OCTOBER
      }
    ],
    [
      'zero entitlement skipped and missing remaining derived',
      {
        copilot_plan: 'business',
        quota_snapshots: {
          premium_interactions: { percent_remaining: 100, unlimited: false, entitlement: 0 },
          chat: { percent_remaining: 90, unlimited: false, entitlement: 300 },
          completions: 'broken'
        }
      },
      {
        plan: 'Business',
        meters: [{ kind: 'chat', usedPercent: 10, used: 30, total: 300, unlimited: false }],
        overage: null,
        resetAt: null
      }
    ]
  ])('reads %s', (_name, raw, expected) => {
    expect(parseEntitlements(raw, NOW)).toEqual({ state: 'ready', checkedAt: NOW, ...expected });
  });

  it.each([null, 'text', {}, { quota_snapshots: 'broken' }])('rejects %j', (raw) => {
    expect(parseEntitlements(raw, NOW)).toEqual({
      state: 'unavailable',
      reason: 'GitHub sent an unexpected response'
    });
  });
});

function windows(lastRequestState: SessionSummary['lastRequestState']): WindowState[] {
  const session: SessionSummary = {
    id: 's1',
    title: 'Fix login',
    createdAt: 0,
    updatedAt: 0,
    status: 'idle',
    lastRequestState,
    modelId: null,
    modeId: null,
    requestCount: 1,
    preview: null,
    pinned: false,
    archived: false
  };
  return [
    {
      windowId: 'w1',
      name: 'demo',
      workspace: null,
      repositories: [],
      folders: [],
      sessions: [session],
      terminals: [],
      canOrganize: true,
      agents: [],
      models: []
    }
  ];
}

describe('UsageFeed', () => {
  const ready: CopilotUsage = {
    state: 'ready',
    plan: 'Pro',
    meters: [],
    overage: null,
    resetAt: null,
    checkedAt: 0
  };
  let access: () => void = () => undefined;
  let clients = 0;
  const read = vi.fn<UsageReader['read']>();
  const published: CopilotUsage[] = [];
  const reports: string[] = [];
  let feed: UsageFeed;

  beforeEach(() => {
    vi.useFakeTimers();
    read.mockReset().mockResolvedValue(ready);
    published.length = 0;
    reports.length = 0;
    clients = 0;
    feed = new UsageFeed({
      reader: {
        read,
        onDidChangeAccess: (listener) => {
          access = listener;
          return { dispose: () => undefined };
        }
      },
      publish: (usage) => published.push(usage),
      hasClients: () => clients > 0,
      report: (message) => reports.push(message)
    });
  });

  afterEach(() => {
    feed.dispose();
    vi.useRealTimers();
  });

  it('reads on start, when a phone returns after a while and when access changes', async () => {
    await vi.advanceTimersByTimeAsync(0);
    feed.phoneVisible();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    feed.phoneVisible();
    await vi.advanceTimersByTimeAsync(0);
    access();
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(3);
    expect(published).toEqual([ready, ready, ready]);
  });

  it('reads after a finished request, no sooner than 30 s after the last read', async () => {
    feed.observe(windows('pending'));
    feed.observe(windows('complete'));
    await vi.advanceTimersByTimeAsync(29_000);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(read).toHaveBeenCalledTimes(2);
    feed.observe(windows('complete'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('polls only while phones are connected', async () => {
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    expect(read).toHaveBeenCalledTimes(1);
    clients = 1;
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('keeps the last usage and reports once while GitHub is unreachable', async () => {
    await vi.advanceTimersByTimeAsync(0);
    read.mockRejectedValue(new Error('fetch failed'));
    access();
    access();
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(3);
    expect(published).toEqual([ready]);
    expect(reports).toEqual(['Copilot usage check failed: fetch failed']);
  });

  it('shows GitHub as unreachable when no usage was read yet', async () => {
    feed.dispose();
    read.mockRejectedValue(new Error('fetch failed'));
    published.length = 0;
    feed = new UsageFeed({
      reader: { read, onDidChangeAccess: () => ({ dispose: () => undefined }) },
      publish: (usage) => published.push(usage),
      hasClients: () => false,
      report: () => undefined
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(published).toEqual([{ state: 'unavailable', reason: 'Could not reach GitHub' }]);
  });
});
