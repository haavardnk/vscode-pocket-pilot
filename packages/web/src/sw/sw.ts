import { type PushPayload, pushPayloadSchema } from '@pocket-pilot/protocol';
import { ExpirationPlugin } from 'workbox-expiration';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

interface SubscriptionChangeEvent extends ExtendableEvent {
  readonly oldSubscription: PushSubscription | null;
}

const FALLBACK: PushPayload = {
  title: 'Pocket Pilot',
  body: 'Open Pocket Pilot for details.',
  tag: 'pocket-pilot',
  url: '/'
};

function payloadOf(data: PushMessageData | null): PushPayload {
  try {
    const parsed = pushPayloadSchema.safeParse(data?.json());
    return parsed.success ? parsed.data : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

function targetOf(data: unknown): URL {
  const url = (data as { url?: unknown } | null)?.url;
  const target = new URL(typeof url === 'string' ? url : '/', self.location.origin);
  return target.origin === self.location.origin ? target : new URL('/', self.location.origin);
}

async function openApp(target: URL): Promise<void> {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const client = windows[0];
  if (!client) {
    await self.clients.openWindow(target.href);
    return;
  }
  client.postMessage({ type: 'navigate', hash: target.hash });
  await client.focus().catch(() => undefined);
}

async function resubscribe(previous: PushSubscription | null): Promise<void> {
  const applicationServerKey = previous?.options.applicationServerKey;
  if (!applicationServerKey) return;
  const subscription = await self.registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey
  });
  await fetch('/api/push', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subscription: subscription.toJSON(), events: null })
  });
}

self.addEventListener('message', (event) => {
  if ((event.data as { type?: unknown } | null)?.type === 'SKIP_WAITING') void self.skipWaiting();
});

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api\//, /^\/ws$/, /^\/internal$/]
  })
);

registerRoute(
  ({ url }) => url.pathname.startsWith('/assets/lang/'),
  new CacheFirst({
    cacheName: 'shiki-languages',
    plugins: [new ExpirationPlugin({ maxEntries: 80 })]
  })
);

self.addEventListener('push', (event) => {
  const { title, body, tag, url } = payloadOf(event.data);
  event.waitUntil(
    self.registration.showNotification(title, { body, tag, icon: '/icon-192.png', data: { url } })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(openApp(targetOf(event.notification.data)));
});

self.addEventListener('pushsubscriptionchange', (event) => {
  const change = event as SubscriptionChangeEvent;
  change.waitUntil(resubscribe(change.oldSubscription));
});
