import type { Command } from './commands.ts';
import type { QueuedRequest } from './domain.ts';

export const PHONE_QUEUE_PREFIX = 'phone:';

export type QueueEntry = Extract<Command, { kind: 'setQueue' }>['queue'][number];

export type QueuePlan = { kind: 'remove'; ids: string[] } | { kind: 'rewrite' };

export function queuePlan(
  current: readonly QueuedRequest[],
  expected: readonly string[],
  queue: readonly QueueEntry[]
): QueuePlan {
  if (
    current.length !== expected.length ||
    current.some((item, index) => item.id !== expected[index])
  ) {
    throw new Error('The queue changed. Check it and try again');
  }
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
    return entry?.id === item.id && entry.delivery === item.delivery && entry.text === item.text;
  });
  if (unchanged && removed.every((item) => !item.id.startsWith(PHONE_QUEUE_PREFIX))) {
    return { kind: 'remove', ids: removed.map((item) => item.id) };
  }
  return { kind: 'rewrite' };
}
