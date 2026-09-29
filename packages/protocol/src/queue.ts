import type { Command } from './commands.ts';
import type { QueuedRequest } from './domain.ts';

export const PHONE_QUEUE_PREFIX = 'phone:';

export type QueueEntry = Extract<Command, { kind: 'setQueue' }>['queue'][number];

export type QueuePlan = { kind: 'remove'; ids: string[] } | { kind: 'rewrite' };

export function queueEntry({
  id,
  delivery,
  text,
  modeId,
  modelId,
  permission
}: QueuedRequest): QueueEntry {
  return { id, delivery, text, modeId, modelId, permission, images: null };
}

export interface SendNowSplit {
  target: QueuedRequest;
  sent: QueuedRequest[];
  rest: QueuedRequest[];
}

function requireExpected(current: readonly QueuedRequest[], expected: readonly string[]): void {
  if (
    current.length !== expected.length ||
    current.some((item, index) => item.id !== expected[index])
  ) {
    throw new Error('The queue changed. Check it and try again');
  }
}

export function sendNowSplit(
  current: readonly QueuedRequest[],
  expected: readonly string[],
  id: string
): SendNowSplit {
  requireExpected(current, expected);
  const target = current.find((item) => item.id === id);
  if (!target) throw new Error('Unknown queued message');
  const others = current.filter((item) => item !== target);
  if (target.delivery === 'queued') return { target, sent: [target], rest: others };
  return {
    target,
    sent: [target, ...others.filter((item) => item.delivery === 'steering')],
    rest: others.filter((item) => item.delivery === 'queued')
  };
}

export function queuePlan(
  current: readonly QueuedRequest[],
  expected: readonly string[],
  queue: readonly QueueEntry[]
): QueuePlan {
  requireExpected(current, expected);
  const ids = queue.map((item) => item.id);
  if (new Set(ids).size !== ids.length || ids.some((id) => !expected.includes(id))) {
    throw new Error('Unknown queued message');
  }
  if (
    queue.some(
      (item, index) => item.delivery === 'steering' && queue[index - 1]?.delivery === 'queued'
    )
  ) {
    throw new Error('Steering messages stay ahead of queued ones');
  }
  const kept = current.filter((item) => ids.includes(item.id));
  const removed = current.filter((item) => !ids.includes(item.id));
  const unchanged = kept.every((item, index) => {
    const entry = queue[index];
    return (
      entry?.id === item.id &&
      entry.delivery === item.delivery &&
      entry.text === item.text &&
      entry.modeId === item.modeId &&
      entry.modelId === item.modelId &&
      entry.permission === item.permission &&
      entry.images === null
    );
  });
  if (unchanged && removed.every((item) => !item.id.startsWith(PHONE_QUEUE_PREFIX))) {
    return { kind: 'remove', ids: removed.map((item) => item.id) };
  }
  return { kind: 'rewrite' };
}
