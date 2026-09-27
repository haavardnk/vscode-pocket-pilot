import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { RequestState, SessionSummary, WindowState } from '@pocket-pilot/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebPushError } from 'web-push';

import { allowedEndpoint } from '../src/push/endpoints';
import { DEFAULT_EVENTS, PushService } from '../src/push/pushService';
import { PushStore, type StoredPush } from '../src/push/pushStore';
import { type SessionAlert, StatusWatcher } from '../src/push/statusWatcher';

function session(state: RequestState | null, requestCount = 1): SessionSummary {
  return {
    id: 's1',
    title: 'Fix login',
    createdAt: 0,
    updatedAt: 0,
    status: 'idle',
    lastRequestState: state,
    modelId: null,
    modeId: null,
    requestCount,
    preview: null,
    pinned: false,
    archived: false
  };
}

function windows(...sessions: SessionSummary[]): WindowState[] {
  return [
    {
      windowId: 'w1',
      name: 'demo',
      repositories: [],
      folders: [],
      sessions,
      canOrganize: true,
      agents: [],
      models: []
    }
  ];
}

function entry(deviceId: string, endpoint: string): StoredPush {
  return {
    deviceId,
    subscription: { endpoint, keys: { p256dh: 'p', auth: 'a' } },
    events: DEFAULT_EVENTS,
    origin: 'https://agent.example.com',
    createdAt: 0
  };
}

describe('allowedEndpoint', () => {
  it.each([
    ['https://fcm.googleapis.com/fcm/send/x', true],
    ['https://web.push.apple.com/x', true],
    ['https://updates.push.services.mozilla.com/wpush/v2/x', true],
    ['https://wns2-par02p.notify.windows.com/w/?token=x', true],
    ['http://fcm.googleapis.com/x', false],
    ['https://fcm.googleapis.com:8443/x', false],
    ['https://evilpush.apple.com/x', false],
    ['https://127.0.0.1/x', false],
    ['https://user@fcm.googleapis.com/x', false]
  ])('%s -> %s', (endpoint, expected) => {
    expect(allowedEndpoint(endpoint)).toBe(expected);
  });
});

describe('StatusWatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each<[string, SessionSummary[], string[]]>([
    ['finishes after the delay', [session('pending'), session('complete')], ['finished']],
    ['asks for input at once', [session('pending'), session('needsInput')], ['needsInput']],
    ['reports failures', [session('pending'), session('failed')], ['failed']],
    ['stays quiet on cancel', [session('pending'), session('cancelled')], []],
    ['ignores the first sighting', [session('complete')], []],
    [
      'drops a finish that is followed by a new request',
      [session('pending'), session('complete'), session('pending', 2)],
      []
    ],
    ['notices a new completed request', [session('complete'), session('complete', 2)], ['finished']]
  ])('%s', (_name, steps, expected) => {
    const alerts: SessionAlert[] = [];
    const watcher = new StatusWatcher((alert) => alerts.push(alert), 1000);
    for (const step of steps) watcher.observe(windows(step));
    vi.advanceTimersByTime(1000);
    expect(alerts.map((alert) => alert.event)).toEqual(expected);
    watcher.dispose();
  });
});

describe('PushService', () => {
  let folder: string;
  let store: PushStore;

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'pocket-pilot-push-'));
    store = new PushStore(join(folder, 'push.json'));
  });

  afterEach(() => rm(folder, { recursive: true, force: true }));

  const alert: SessionAlert = {
    event: 'needsInput',
    windowId: 'w1',
    windowName: 'demo',
    session: session('needsInput')
  };

  function service(send: (endpoint: string) => Promise<void>, visible: string[] = []): PushService {
    return new PushService({
      store,
      keys: { publicKey: 'public', privateKey: 'private' },
      activeDevices: () => Promise.resolve(new Set(['phone', 'tablet', 'laptop'])),
      visible: (deviceId) => visible.includes(deviceId),
      send: (subscription) => send(subscription.endpoint),
      report: () => undefined
    });
  }

  it('keeps one subscription per endpoint', async () => {
    await store.put(entry('phone', 'https://fcm.googleapis.com/a'));
    await store.put(entry('tablet', 'https://fcm.googleapis.com/a'));
    expect((await store.list()).map((item) => item.deviceId)).toEqual(['tablet']);
  });

  it('skips visible devices, disabled events and removed devices', async () => {
    await store.put(entry('phone', 'https://fcm.googleapis.com/phone'));
    await store.put({
      ...entry('tablet', 'https://fcm.googleapis.com/tablet'),
      events: { ...DEFAULT_EVENTS, needsInput: false }
    });
    await store.put(entry('gone', 'https://fcm.googleapis.com/gone'));
    await store.put(entry('laptop', 'https://fcm.googleapis.com/laptop'));
    const sent: string[] = [];
    await service(
      async (endpoint) => {
        sent.push(endpoint);
      },
      ['laptop']
    ).notify(alert);
    expect(sent).toEqual(['https://fcm.googleapis.com/phone']);
    expect((await store.list()).map((item) => item.deviceId)).not.toContain('gone');
  });

  it('forgets expired subscriptions', async () => {
    await store.put(entry('phone', 'https://fcm.googleapis.com/phone'));
    await service(() =>
      Promise.reject(new WebPushError('gone', 410, {}, '', 'https://fcm.googleapis.com/phone'))
    ).notify(alert);
    expect(await store.list()).toEqual([]);
  });
});
