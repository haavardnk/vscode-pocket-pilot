import { type PushEvents, type PushSettings, pushSettingsSchema } from '@pocket-pilot/protocol';

import { request } from './http';

export async function fetchPush(): Promise<PushSettings> {
  return pushSettingsSchema.parse(await request('/api/push'));
}

export async function registerPush(
  subscription: PushSubscriptionJSON,
  events: PushEvents | null
): Promise<PushSettings> {
  const body = JSON.stringify({ subscription, events });
  return pushSettingsSchema.parse(await request('/api/push', { method: 'PUT', body }));
}

export async function deletePush(): Promise<void> {
  await request('/api/push', { method: 'DELETE' });
}

export async function testPush(): Promise<void> {
  await request('/api/push/test', { method: 'POST' });
}
