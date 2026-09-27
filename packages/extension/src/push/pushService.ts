import type {
  PushEvent,
  PushEvents,
  PushPayload,
  PushRegistration,
  PushSettings,
  PushSubscriptionInfo
} from '@pocket-pilot/protocol';
import webpush, { type RequestOptions, type Urgency, WebPushError } from 'web-push';

import { errorMessage } from '../errors';
import { type PushEndpoint, PushError } from '../server/pushRoutes';
import { allowedEndpoint } from './endpoints';
import type { PushStore, StoredPush } from './pushStore';
import type { SessionAlert } from './statusWatcher';
import type { VapidKeys } from './vapid';

export type SendPush = (
  subscription: PushSubscriptionInfo,
  payload: string,
  options: RequestOptions
) => Promise<unknown>;

export interface PushServiceOptions {
  store: PushStore;
  keys: VapidKeys;
  activeDevices: () => Promise<ReadonlySet<string>>;
  visible: (deviceId: string) => boolean;
  send?: SendPush;
  report: (message: string) => void;
}

export const DEFAULT_EVENTS: PushEvents = { finished: true, needsInput: true, failed: true };

const TTL_SECONDS = 3600;
const TIMEOUT_MS = 10_000;
const GONE = new Set([404, 410]);

const LABELS: Record<PushEvent, string> = {
  finished: 'Finished',
  needsInput: 'Needs your input',
  failed: 'Failed'
};

function alertPayload({ event, windowId, windowName, session }: SessionAlert): PushPayload {
  return {
    title: session.title,
    body: `${LABELS[event]} · ${windowName}`,
    tag: `${windowId}/${session.id}`,
    url: `/#/session/${encodeURIComponent(windowId)}/${encodeURIComponent(session.id)}`
  };
}

export class PushService implements PushEndpoint {
  private readonly send: SendPush;

  constructor(private readonly options: PushServiceOptions) {
    this.send = options.send ?? webpush.sendNotification;
  }

  async settings(deviceId: string): Promise<PushSettings> {
    const entry = await this.options.store.get(deviceId);
    return { publicKey: this.options.keys.publicKey, events: entry?.events ?? null };
  }

  async register(
    deviceId: string,
    registration: PushRegistration,
    origin: string
  ): Promise<PushSettings> {
    if (!allowedEndpoint(registration.subscription.endpoint))
      throw new PushError(400, 'This browser push service is not supported');
    const existing = await this.options.store.get(deviceId);
    const events = registration.events ?? existing?.events ?? DEFAULT_EVENTS;
    await this.options.store.put({
      deviceId,
      subscription: registration.subscription,
      events,
      origin,
      createdAt: Date.now()
    });
    return { publicKey: this.options.keys.publicKey, events };
  }

  unregister(deviceId: string): Promise<void> {
    return this.options.store.remove((entry) => entry.deviceId === deviceId);
  }

  async test(deviceId: string): Promise<void> {
    const entry = await this.options.store.get(deviceId);
    if (!entry) throw new PushError(404, 'Notifications are off on this device');
    const payload: PushPayload = {
      title: 'Pocket Pilot',
      body: 'Notifications work on this device.',
      tag: 'test',
      url: '/#/settings'
    };
    try {
      await this.deliver(entry, payload, 'normal');
    } catch (error) {
      if (!(error instanceof WebPushError)) throw new PushError(502, errorMessage(error));
      if (GONE.has(error.statusCode))
        throw new PushError(410, 'This subscription expired. Turn notifications on again.');
      throw new PushError(502, `The push service answered ${error.statusCode}`);
    }
  }

  async notify(alert: SessionAlert): Promise<void> {
    const { store, activeDevices, visible, report } = this.options;
    const active = await activeDevices();
    const entries = await store.list();
    if (entries.some((entry) => !active.has(entry.deviceId)))
      await store.remove((entry) => !active.has(entry.deviceId));
    const targets = entries.filter(
      (entry) => active.has(entry.deviceId) && entry.events[alert.event] && !visible(entry.deviceId)
    );
    const payload = alertPayload(alert);
    const urgency: Urgency = alert.event === 'needsInput' ? 'high' : 'normal';
    await Promise.all(
      targets.map((entry) =>
        this.deliver(entry, payload, urgency).catch((error: unknown) => {
          if (!(error instanceof WebPushError && GONE.has(error.statusCode)))
            report(`Push notification failed: ${errorMessage(error)}`);
        })
      )
    );
  }

  private async deliver(entry: StoredPush, payload: PushPayload, urgency: Urgency): Promise<void> {
    const { keys, store } = this.options;
    try {
      await this.send(entry.subscription, JSON.stringify(payload), {
        vapidDetails: { subject: entry.origin, ...keys },
        TTL: TTL_SECONDS,
        urgency,
        timeout: TIMEOUT_MS
      });
    } catch (error) {
      if (error instanceof WebPushError && GONE.has(error.statusCode))
        await store.remove((item) => item.subscription.endpoint === entry.subscription.endpoint);
      throw error;
    }
  }
}
