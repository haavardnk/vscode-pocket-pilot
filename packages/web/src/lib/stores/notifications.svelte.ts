import type { PushEvent, PushEvents } from '@pocket-pilot/protocol';

import { deletePush, fetchPush, registerPush, testPush } from '../api/push';

function keyBytes(key: string): Uint8Array<ArrayBuffer> {
  const base64 = key.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), (char) =>
    char.charCodeAt(0)
  );
}

function sameKey(current: ArrayBuffer | null, key: Uint8Array): boolean {
  if (!current || current.byteLength !== key.length) return false;
  const bytes = new Uint8Array(current);
  return key.every((byte, index) => bytes[index] === byte);
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

class NotificationStore {
  readonly supported =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  permission = $state<NotificationPermission>('default');
  events = $state<PushEvents | null>(null);
  loaded = $state(false);
  busy = $state(false);
  private publicKey: string | null = null;

  async load(): Promise<void> {
    if (!this.supported) return;
    this.permission = Notification.permission;
    const [settings, subscription] = await Promise.all([fetchPush(), currentSubscription()]);
    this.publicKey = settings.publicKey;
    this.events = subscription && this.permission === 'granted' ? settings.events : null;
    this.loaded = true;
  }

  enable(): Promise<void> {
    return this.run(async () => {
      this.permission = await Notification.requestPermission();
      if (this.permission !== 'granted' || !this.publicKey) return;
      const subscription = await this.subscribe(this.publicKey);
      this.events = (await registerPush(subscription.toJSON(), null)).events;
    });
  }

  disable(): Promise<void> {
    return this.run(async () => {
      const subscription = await currentSubscription();
      await deletePush();
      await subscription?.unsubscribe();
      this.events = null;
    });
  }

  setEvent(event: PushEvent, value: boolean): Promise<void> {
    return this.run(async () => {
      const subscription = await currentSubscription();
      if (!subscription || !this.events) return;
      this.events = (
        await registerPush(subscription.toJSON(), { ...this.events, [event]: value })
      ).events;
    });
  }

  test(): Promise<void> {
    return this.run(testPush);
  }

  private async subscribe(publicKey: string): Promise<PushSubscription> {
    const key = keyBytes(publicKey);
    const { pushManager } = await navigator.serviceWorker.ready;
    const existing = await pushManager.getSubscription();
    if (existing && sameKey(existing.options.applicationServerKey, key)) return existing;
    await existing?.unsubscribe();
    return pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  }

  private async run(task: () => Promise<void>): Promise<void> {
    this.busy = true;
    try {
      await task();
    } finally {
      this.busy = false;
    }
  }
}

export const notifications = new NotificationStore();
