const CACHE = 'pocket-pilot-notification';
const KEY = '/__notification-target';
const FRESH_MS = 30_000;

export async function rememberTarget(hash: string): Promise<void> {
  const cache = await caches.open(CACHE);
  await cache.put(KEY, new Response(JSON.stringify({ hash, at: Date.now() })));
}

export async function takeTarget(): Promise<string | null> {
  const cache = await caches.open(CACHE);
  const response = await cache.match(KEY);
  if (!response) return null;
  await cache.delete(KEY);
  const { hash, at } = (await response.json()) as { hash?: unknown; at?: unknown };
  if (typeof hash !== 'string' || typeof at !== 'number') return null;
  return Date.now() - at < FRESH_MS ? hash : null;
}
