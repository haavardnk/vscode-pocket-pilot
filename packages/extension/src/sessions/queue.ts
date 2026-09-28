import type { QueuedRequest } from '@pocket-pilot/protocol';

import { matchesRequest } from './transcript';

const OVERLAY_MS = 120_000;

export interface StartedTurn {
  key: string;
  text: string;
}

export interface QueueOverlay {
  items: QueuedRequest[];
  at: number;
  seen: ReadonlySet<string>;
}

export function withQueued(queue: readonly QueuedRequest[], item: QueuedRequest): QueuedRequest[] {
  if (item.delivery === 'queued') return [...queue, item];
  const firstQueued = queue.findIndex((entry) => entry.delivery !== 'steering');
  const at = firstQueued < 0 ? queue.length : firstQueued;
  return [...queue.slice(0, at), item, ...queue.slice(at)];
}

export function remainingQueue(
  queue: readonly QueuedRequest[],
  started: readonly StartedTurn[],
  seen: ReadonlySet<string>
): QueuedRequest[] {
  let left = [...queue];
  for (const turn of started) {
    const head = left[0];
    if (seen.has(turn.key) || !head || !matchesRequest(turn.text, head.text)) continue;
    const taken =
      head.delivery === 'steering'
        ? left.findIndex(
            (item) => item.delivery !== 'steering' || !matchesRequest(turn.text, item.text)
          )
        : 1;
    left = taken < 0 ? [] : left.slice(taken);
  }
  return left;
}

export function currentQueue(
  logged: readonly QueuedRequest[],
  overlay: QueueOverlay | null,
  started: readonly StartedTurn[],
  loggedAt: number,
  now: number
): QueuedRequest[] {
  if (overlay && loggedAt < overlay.at && now - overlay.at < OVERLAY_MS) {
    return remainingQueue(overlay.items, started, overlay.seen);
  }
  return remainingQueue(logged, started, new Set());
}
