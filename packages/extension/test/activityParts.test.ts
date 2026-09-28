import type { ResponsePart, ToolStatus } from '@pocket-pilot/protocol';
import { describe, expect, it } from 'vitest';

import { withActivity } from '../src/sessions/activityParts';
import { toolLabel } from '../src/sessions/toolLabels';
import type { TranscriptEvent } from '../src/sessions/transcript';

function edit(path: string, callId: string): ResponsePart {
  return { kind: 'edit', path, stopId: null, callId, additions: null, deletions: null };
}

function start(
  callId: string,
  name: string,
  args: object
): Extract<TranscriptEvent, { type: 'toolStart' }> {
  return { type: 'toolStart', at: 1, callId, name, args: JSON.stringify(args) };
}

describe('activity parts', () => {
  it.each<[string, object, ToolStatus, string]>([
    [
      'read_file',
      { filePath: '/r/a.ts', startLine: 1, endLine: 9 },
      'done',
      'Read a.ts, lines 1 to 9'
    ],
    ['read_file', { filePath: '/r/a.ts' }, 'running', 'Reading a.ts'],
    [
      'grep_search',
      { query: 'a|b', isRegexp: true, includePattern: 'src/**' },
      'done',
      'Searched for regex `a|b` (`**/src/**`)'
    ],
    ['file_search', { query: '**/*.md' }, 'running', 'Searching for files matching `**/*.md`'],
    [
      'send_to_terminal',
      { command: 'x'.repeat(90) },
      'done',
      `Sent \`${'x'.repeat(77)}...\` to terminal`
    ],
    ['run_in_terminal', { command: ' npm test ' }, 'done', 'Ran `npm test`'],
    ['run_playwright_code', {}, 'failed', 'Browser action failed'],
    ['runSubagent', { description: 'Explore code' }, 'running', 'Explore code'],
    ['read_file', {}, 'done', 'read_file'],
    ['get_errors', { filePaths: ['/r/a.ts'] }, 'done', 'get_errors']
  ])('labels %s like VS Code', (name, args, status, label) => {
    expect(toolLabel(name, args as Record<string, unknown>, status)).toBe(label);
  });

  it('turns hidden edit tools into merged file edits', () => {
    const events = [
      start('c1', 'replace_string_in_file', { filePath: '/r/a.ts' }),
      start('c2', 'multi_replace_string_in_file', {
        replacements: [{ filePath: '/r/a.ts' }, { filePath: '/r/b.ts' }]
      }),
      start('c3', 'task_complete', {}),
      start('c4', 'replace_string_in_file', { filePath: '/r/c.ts' }),
      start('c5', 'replace_string_in_file', { filePath: '/r/d.ts' })
    ];
    const statuses = new Map<string, ToolStatus>(events.map((event) => [event.callId, 'done']));
    const parts = withActivity([edit('/r/c.ts', 'c4')], {
      events,
      statuses,
      toolsOnly: true,
      settled: false
    });
    expect(parts).toEqual([
      edit('/r/c.ts', 'c4'),
      edit('/r/a.ts', 'c1'),
      edit('/r/b.ts', 'c2'),
      edit('/r/d.ts', 'c5')
    ]);
  });
});
