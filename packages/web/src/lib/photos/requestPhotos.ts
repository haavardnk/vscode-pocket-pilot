import type { ImageResult } from '@pocket-pilot/protocol';

import { hub } from '../stores/hub.svelte';

const CACHED_PHOTOS = 30;

const cache = new Map<string, Promise<ImageResult>>();

export function requestPhoto(
  windowId: string,
  sessionId: string,
  requestId: string,
  imageId: string
): Promise<ImageResult> {
  const key = JSON.stringify([windowId, sessionId, requestId, imageId]);
  const cached = cache.get(key);
  if (cached) {
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }
  const loading = hub.query({ kind: 'requestImage', windowId, sessionId, requestId, imageId });
  cache.set(key, loading);
  loading.catch(() => {
    if (cache.get(key) === loading) cache.delete(key);
  });
  for (const oldest of [...cache.keys()].slice(0, Math.max(0, cache.size - CACHED_PHOTOS))) {
    cache.delete(oldest);
  }
  return loading;
}
