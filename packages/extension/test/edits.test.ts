import { describe, expect, it } from 'vitest';

import type { Blob } from '../src/code/files';
import { LiveEdits, type RequestWindow } from '../src/sessions/liveEdits';
import { applyEdits, parseTimeline, requestEdit, type TextEdit } from '../src/sessions/timeline';

const range = (
  startLineNumber: number,
  startColumn: number,
  endLineNumber: number,
  endColumn: number
): TextEdit['range'] => ({ startLineNumber, startColumn, endLineNumber, endColumn });

const uri = (fsPath: string): { scheme: string; fsPath: string } => ({ scheme: 'file', fsPath });

const timeline = (operations: unknown[], baselines: [string, string][]): unknown => ({
  timeline: {
    operations,
    fileBaselines: baselines.map(([requestId, content]) => [
      `file:///a.ts::${requestId}`,
      { uri: uri('/a.ts'), requestId, content, epoch: 0 }
    ])
  }
});

const text = (requestId: string, epoch: number, edits: TextEdit[]): unknown => ({
  type: 'textEdit',
  uri: uri('/a.ts'),
  requestId,
  epoch,
  edits
});

describe('edit timeline', () => {
  it.each([
    ['one\ntwo\n', [{ text: '2', range: range(2, 1, 2, 4) }], 'one\n2\n'],
    ['a\r\nb\r\n', [{ text: 'x', range: range(1, 1, 1, 99) }], 'x\r\nb\r\n'],
    [
      'abc',
      [
        { text: 'Z', range: range(1, 3, 1, 4) },
        { text: 'X', range: range(1, 1, 1, 2) }
      ],
      'XbZ'
    ],
    ['a\nb\nc\n', [{ text: '', range: range(1, 2, 3, 1) }], 'ac\n'],
    ['a', [{ text: 'b', range: range(5, 1, 5, 1) }], 'ab']
  ])('applies edits %#', (before, edits, after) => {
    expect(applyEdits(before, edits)).toBe(after);
  });

  it.each([
    [
      'edited',
      timeline(
        [
          text('r1', 2, [{ text: 'c', range: range(1, 3, 1, 3) }]),
          text('r1', 1, [{ text: 'b', range: range(1, 2, 1, 2) }]),
          text('r2', 3, [{ text: 'z', range: range(1, 1, 1, 1) }])
        ],
        [['r1', 'a']]
      ),
      { before: 'a', after: 'abc' }
    ],
    [
      'created',
      timeline(
        [
          { type: 'create', uri: uri('/a.ts'), requestId: 'r1', epoch: 1, initialContent: '' },
          text('r1', 2, [{ text: 'new', range: range(1, 1, 1, 1) }])
        ],
        []
      ),
      { before: null, after: 'new' }
    ],
    [
      'deleted',
      timeline([{ type: 'delete', uri: uri('/a.ts'), requestId: 'r1', epoch: 1 }], [['r1', 'a']]),
      { before: 'a', after: null }
    ],
    ['untouched', timeline([text('r2', 1, [])], [['r1', 'a']]), null],
    ['missing baseline', timeline([text('r1', 1, [])], []), null],
    [
      'unknown operation',
      timeline([{ type: 'rename', uri: uri('/a.ts'), requestId: 'r1', epoch: 1 }], [['r1', 'a']]),
      null
    ],
    ['malformed state', { timeline: {} }, null]
  ])('rebuilds a %s file', (_, raw, expected) => {
    expect(requestEdit(parseTimeline(raw), 'r1', '/a.ts')).toEqual(expected);
  });
});

describe('live edits', () => {
  const at = 1_700_000_000_000;
  const files = new Map<string, string>([['/a.ts', 'now']]);
  const current = (path: string): Promise<Blob> => {
    const content = files.get(path);
    return Promise.resolve(content === undefined ? 'missing' : Buffer.from(content));
  };
  const read = (blob: Blob | undefined): string | undefined =>
    Buffer.isBuffer(blob) ? blob.toString() : blob;

  it.each<[string, RequestWindow, string[] | null]>([
    ['the matching turn', { message: 'Fix it', timestamp: at + 1000, until: null }, ['/a.ts']],
    ['a later request', { message: 'Fix it', timestamp: at + 5000, until: null }, null],
    ['a turn after the next request', { message: 'Fix it', timestamp: at - 9000, until: at }, null],
    ['another prompt', { message: 'Other', timestamp: at, until: null }, null]
  ])('matches %s', async (_, request, paths) => {
    const live = new LiveEdits(current);
    await live.hook({ kind: 'prompt', sessionId: 's1', at, prompt: 'Fix it' });
    await live.hook({
      kind: 'toolStart',
      sessionId: 's1',
      at,
      callId: 'c1',
      toolName: 'create_file',
      paths: ['/a.ts'],
      command: null
    });
    const span = live.span('s1', request);
    expect(span ? [...span.files.keys()] : null).toEqual(paths);
  });

  it('ends a turn where the next turn captured the file', async () => {
    const live = new LiveEdits(current);
    files.set('/a.ts', 'first');
    await live.hook({ kind: 'prompt', sessionId: 's1', at, prompt: 'One' });
    await live.hook({
      kind: 'toolStart',
      sessionId: 's1',
      at,
      callId: 'c1',
      toolName: 'create_file',
      paths: ['/a.ts', '/b.ts'],
      command: null
    });
    files.set('/a.ts', 'second');
    await live.hook({ kind: 'prompt', sessionId: 's1', at: at + 10_000, prompt: 'Two' });
    await live.hook({
      kind: 'toolStart',
      sessionId: 's1',
      at: at + 10_000,
      callId: 'c2',
      toolName: 'create_file',
      paths: ['/a.ts'],
      command: null
    });
    files.set('/a.ts', 'third');
    const span = live.span('s1', { message: 'One', timestamp: at, until: at + 10_000 });
    expect(read(span?.files.get('/a.ts'))).toBe('first');
    expect(read(span?.files.get('/b.ts'))).toBe('missing');
    expect(read(await span?.after('/a.ts'))).toBe('second');
    expect(read(await span?.after('/b.ts'))).toBe('missing');
  });
});
