import { describe, expect, it } from 'vitest';

import { applyLogEntry, type LogEntry, parseLogEntry } from '../src/sessions/mutationLog';

describe('mutation log', () => {
  it.each<[string, unknown, LogEntry, unknown]>([
    ['snapshot', undefined, { kind: 0, v: { a: 1 } }, { a: 1 }],
    ['set', { a: { b: 1 } }, { kind: 1, k: ['a', 'b'], v: 2 }, { a: { b: 2 } }],
    ['set index', { a: [1, 2] }, { kind: 1, k: ['a', 1], v: 3 }, { a: [1, 3] }],
    ['push', { a: [1] }, { kind: 2, k: ['a'], v: [2, 3] }, { a: [1, 2, 3] }],
    ['truncate push', { a: [1, 2, 3] }, { kind: 2, k: ['a'], v: [9], i: 1 }, { a: [1, 9] }],
    ['clear', { a: [1, 2] }, { kind: 2, k: ['a'], i: 0 }, { a: [] }],
    ['push new', { b: 1 }, { kind: 2, k: ['a'], v: [1] }, { a: [1], b: 1 }],
    ['delete', { a: 1, b: 2 }, { kind: 3, k: ['a'] }, { b: 2 }]
  ])('applies %s', (_name, root, entry, expected) => {
    expect(applyLogEntry(structuredClone(root), entry)).toEqual(expected);
  });

  it('throws on a missing parent path', () => {
    expect(() => applyLogEntry({}, { kind: 1, k: ['a', 'b'], v: 1 })).toThrow();
  });

  it.each([
    ['{"kind":1,"k":["a"],"v":1}', { kind: 1, k: ['a'], v: 1 }],
    ['{"kind":2,"k":["a"],"i":0}', { kind: 2, k: ['a'], i: 0 }],
    ['not json', null],
    ['{"kind":1,"k":"a"}', null],
    ['{"kind":7,"k":[]}', null]
  ])('parses %s', (line, expected) => {
    expect(parseLogEntry(line)).toEqual(expected);
  });
});
