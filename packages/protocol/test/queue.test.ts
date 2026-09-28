import { describe, expect, it } from 'vitest';

import { type QueuedRequest, queuePlan } from '../src';

const queued = (id: string, delivery: QueuedRequest['delivery'] = 'queued'): QueuedRequest => ({
  id,
  delivery,
  text: id,
  attachments: 0
});
const entry = ({ id, delivery, text }: QueuedRequest) => ({ id, delivery, text });
const current = [queued('s', 'steering'), queued('a'), queued('b')];
const ids = ['s', 'a', 'b'];

describe('queuePlan', () => {
  it.each([
    ['nothing changed', current, ids, current.map(entry), { kind: 'remove', ids: [] }],
    [
      'deletion',
      current,
      ids,
      [entry(queued('s', 'steering')), entry(queued('b'))],
      { kind: 'remove', ids: ['a'] }
    ],
    [
      'deletion of a message only the phone knows',
      [queued('phone:1'), queued('b')],
      ['phone:1', 'b'],
      [entry(queued('b'))],
      { kind: 'rewrite' }
    ],
    [
      'reorder',
      current,
      ids,
      [entry(queued('s', 'steering')), entry(queued('b')), entry(queued('a'))],
      { kind: 'rewrite' }
    ],
    [
      'edit',
      current,
      ids,
      [entry(queued('s', 'steering')), { ...entry(queued('a')), text: 'new' }, entry(queued('b'))],
      { kind: 'rewrite' }
    ],
    ['stale queue', current, ['s', 'a'], [], 'The queue changed'],
    ['unknown message', current, ids, [entry(queued('x'))], 'Unknown queued message'],
    [
      'duplicate message',
      current,
      ids,
      [entry(queued('a')), entry(queued('a'))],
      'Unknown queued message'
    ],
    [
      'steering behind queued',
      current,
      ids,
      [entry(queued('a')), entry(queued('s', 'steering'))],
      'Steering messages stay ahead'
    ]
  ] as const)('plans %s', (_name, before, expected, queue, plan) => {
    const run = () => queuePlan(before, expected, queue);
    if (typeof plan === 'string') expect(run).toThrow(plan);
    else expect(run()).toEqual(plan);
  });
});
