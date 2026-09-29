import { describe, expect, it } from 'vitest';

import {
  type QueuedRequest,
  type QueueEntry,
  queueEntry as entry,
  queuePlan,
  sendNowSplit
} from '../src';

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
    [
      'delivery change',
      current,
      ids,
      [
        entry(queued('s', 'steering')),
        { ...entry(queued('a')), delivery: 'steering' },
        entry(queued('b'))
      ],
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

describe('sendNowSplit', () => {
  const steering = [queued('s1', 'steering'), queued('s2', 'steering'), queued('a'), queued('b')];
  const order = steering.map((item) => item.id);

  it.each([
    ['steering with every steering message', 's2', ['s2', 's1'], ['a', 'b']],
    ['a queued message alone', 'b', ['b'], ['s1', 's2', 'a']]
  ])('sends %s', (_name, id, sent, rest) => {
    const split = sendNowSplit(steering, order, id);
    expect(split.sent.map((item) => item.id)).toEqual(sent);
    expect(split.rest.map((item) => item.id)).toEqual(rest);
  });

  it.each([
    ['a stale queue', ['s1'], 's1', 'The queue changed'],
    ['an unknown message', order, 'x', 'Unknown queued message']
  ])('rejects %s', (_name, expected, id, error) => {
    expect(() => sendNowSplit(steering, expected, id)).toThrow(error);
  });
});
