import type { RequestView } from '@pocket-pilot/protocol';
import { describe, expect, it } from 'vitest';

import { removalText, restoreImpact } from '../src/lib/hub/checkpoints';

const request = (id: string, paths: string[]): RequestView => ({
  id,
  timestamp: 0,
  message: id,
  modelId: null,
  agentName: null,
  state: 'complete',
  error: null,
  editable: true,
  disabled: false,
  editedPaths: paths,
  parts: []
});

const REQUESTS = [
  request('r1', ['/a.ts']),
  request('r2', ['/b.ts', '/c.ts']),
  request('r3', ['/b.ts']),
  request('r4', [])
];

describe('restore impact', () => {
  it.each([
    [
      0,
      { messages: 4, files: 3 },
      'Removes this and 3 later messages and undoes edits to 3 files.'
    ],
    [
      1,
      { messages: 3, files: 2 },
      'Removes this and 2 later messages and undoes edits to 2 files.'
    ],
    [2, { messages: 2, files: 1 }, 'Removes this and 1 later message and undoes edits to 1 file.'],
    [3, { messages: 1, files: 0 }, 'Removes this message.']
  ])('from request %i', (index, impact, text) => {
    expect(restoreImpact(REQUESTS, index)).toEqual(impact);
    expect(removalText(impact)).toBe(text);
  });
});
