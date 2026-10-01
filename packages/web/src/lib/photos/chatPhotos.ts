import type { ImageResult } from '@pocket-pilot/protocol';

import { hub } from '../stores/hub.svelte';

export type ChatPhoto = Pick<ImageResult, 'mimeType' | 'data'>;

const CACHED_PHOTOS = 30;

const cache = new Map<string, Promise<ChatPhoto>>();

function cached(key: string, load: () => Promise<ChatPhoto>): Promise<ChatPhoto> {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const loading = load();
  cache.set(key, loading);
  loading.catch(() => {
    if (cache.get(key) === loading) cache.delete(key);
  });
  for (const oldest of [...cache.keys()].slice(0, Math.max(0, cache.size - CACHED_PHOTOS))) {
    cache.delete(oldest);
  }
  return loading;
}

export function requestPhoto(
  windowId: string,
  sessionId: string,
  requestId: string,
  imageId: string,
  sent?: ChatPhoto
): Promise<ChatPhoto> {
  return cached(JSON.stringify(['request', windowId, sessionId, requestId, imageId]), () =>
    sent
      ? Promise.resolve(sent)
      : hub.query({ kind: 'requestImage', windowId, sessionId, requestId, imageId })
  );
}

export function toolPhoto(
  windowId: string,
  sessionId: string,
  requestId: string,
  callId: string,
  index: number
): Promise<ChatPhoto> {
  return cached(JSON.stringify(['tool', windowId, sessionId, requestId, callId, index]), () =>
    hub.query({ kind: 'toolImage', windowId, sessionId, requestId, callId, index })
  );
}
