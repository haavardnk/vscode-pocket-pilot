import type { QueuedRequest } from '@pocket-pilot/protocol';
import { describe, expect, it } from 'vitest';

import { currentQueue, remainingQueue, withQueued } from '../src/sessions/queue';

const item = (id: string, delivery: QueuedRequest['delivery'] = 'queued'): QueuedRequest => ({
  id,
  delivery,
  text: `Do ${id}`,
  modeId: null,
  modelId: null,
  permission: null,
  images: [],
  attachments: 0
});

const queue = [item('a', 'steering'), item('b', 'steering'), item('c'), item('d')];

describe('queue', () => {
  it.each([
    ['nothing started', [], [], ['a', 'b', 'c', 'd']],
    ['merged steering', [{ key: 't1', text: 'Do a\n\nDo b' }], [], ['c', 'd']],
    ['one steering', [{ key: 't1', text: 'Do a' }], [], ['b', 'c', 'd']],
    [
      'steering then queued',
      [
        { key: 't1', text: 'Do a\n\nDo b' },
        { key: 't2', text: 'Do c' }
      ],
      [],
      ['d']
    ],
    ['only the head', [{ key: 't1', text: 'Do c' }], [], ['a', 'b', 'c', 'd']],
    ['seen before', [{ key: 't1', text: 'Do a\n\nDo b' }], ['t1'], ['a', 'b', 'c', 'd']]
  ])('drops dispatched messages: %s', (_name, started, seen, expected) => {
    expect(remainingQueue(queue, started, new Set(seen)).map((entry) => entry.id)).toEqual(
      expected
    );
  });

  it.each([
    ['queued goes last', item('x'), ['a', 'b', 'c', 'd', 'x']],
    ['steering goes after steering', item('x', 'steering'), ['a', 'b', 'x', 'c', 'd']]
  ])('adds a message: %s', (_name, added, expected) => {
    expect(withQueued(queue, added).map((entry) => entry.id)).toEqual(expected);
  });

  it.each([
    ['no overlay', null, 0, 0, ['a', 'b', 'c', 'd']],
    ['overlay before the log catches up', 100, 50, 150, ['x']],
    ['log written after the overlay', 100, 100, 150, ['a', 'b', 'c', 'd']],
    ['overlay expired', 100, 50, 120_100, ['a', 'b', 'c', 'd']]
  ])('picks the queue source: %s', (_name, at, loggedAt, now, expected) => {
    const overlay = at === null ? null : { items: [item('x')], at, seen: new Set<string>() };
    expect(currentQueue(queue, overlay, [], loggedAt, now).map((entry) => entry.id)).toEqual(
      expected
    );
  });
});
