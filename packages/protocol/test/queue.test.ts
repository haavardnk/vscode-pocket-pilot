import { describe, expect, it } from 'vitest';

import { type QueuedRequest, type QueueEntry, queueEntry as entry, queuePlan } from '../src';

const queued = (id: string, delivery: QueuedRequest['delivery'] = 'queued'): QueuedRequest => ({
  id,
  delivery,
  text: id,
  modeId: 'agent',
  modelId: 'copilot/gpt-5',
  permission: 'default',
  images: [],
  attachments: 0
});
const current = [queued('s', 'steering'), queued('a'), queued('b')];
const ids = ['s', 'a', 'b'];
const edited = (change: Partial<QueueEntry>): QueueEntry[] => [
  entry(queued('s', 'steering')),
  { ...entry(queued('a')), ...change },
  entry(queued('b'))
];

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
    ['text edit', current, ids, edited({ text: 'new' }), { kind: 'rewrite' }],
    ['agent change', current, ids, edited({ modeId: 'ask' }), { kind: 'rewrite' }],
    ['model change', current, ids, edited({ modelId: 'copilot/o3' }), { kind: 'rewrite' }],
    ['approval change', current, ids, edited({ permission: 'autopilot' }), { kind: 'rewrite' }],
    ['photo change', current, ids, edited({ images: [] }), { kind: 'rewrite' }],
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
