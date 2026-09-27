import { describe, expect, it } from 'vitest';

import { editPaths, parseHook } from '../src/hooks/hookEvent';

const at = Date.UTC(2026, 0, 1);
const payload = {
  session_id: 's1',
  timestamp: '2026-01-01T00:00:00.000Z',
  transcript_path: '/u/workspaceStorage/w1/GitHub.copilot-chat/transcripts/s1.jsonl'
};

describe('chat hooks', () => {
  it.each([
    [
      'a prompt',
      { ...payload, hook_event_name: 'UserPromptSubmit', prompt: 'Fix it' },
      { windowId: 'w1', event: { kind: 'prompt', sessionId: 's1', at, prompt: 'Fix it' } }
    ],
    [
      'an edit tool',
      {
        ...payload,
        hook_event_name: 'PreToolUse',
        tool_name: 'create_file',
        tool_use_id: 'call_1__vscode-9',
        tool_input: { filePath: '/w/a.ts' }
      },
      {
        windowId: 'w1',
        event: {
          kind: 'toolStart',
          sessionId: 's1',
          at,
          callId: 'call_1',
          toolName: 'create_file',
          paths: ['/w/a.ts']
        }
      }
    ],
    [
      'a finished tool',
      { ...payload, hook_event_name: 'PostToolUse', tool_use_id: 'call_1' },
      { windowId: 'w1', event: { kind: 'toolEnd', sessionId: 's1', at, callId: 'call_1' } }
    ],
    [
      'an empty window',
      { ...payload, hook_event_name: 'Stop', transcript_path: undefined },
      { windowId: null, event: { kind: 'stop', sessionId: 's1', at } }
    ],
    ['a tool without id', { ...payload, hook_event_name: 'PostToolUse' }, null],
    ['an unsafe session', { ...payload, hook_event_name: 'Stop', session_id: '../s1' }, null],
    ['an unknown event', { ...payload, hook_event_name: 'SessionStart' }, null]
  ])('parses %s', (_, body, expected) => {
    expect(parseHook(body)).toEqual(expected);
  });

  it.each([
    ['replace_string_in_file', { filePath: '/w/a.ts', oldString: 'a' }, ['/w/a.ts']],
    ['create_file', JSON.stringify({ filePath: 'file:///w/b%20c.ts' }), ['/w/b c.ts']],
    [
      'multi_replace_string_in_file',
      { replacements: [{ filePath: '/w/a.ts' }, { filePath: '/w/b.ts' }, { filePath: '/w/a.ts' }] },
      ['/w/a.ts', '/w/b.ts']
    ],
    [
      'apply_patch',
      { input: '*** Begin Patch\n*** Update File: /w/a.ts\n@@\n*** Add File: /w/n.ts\n+x\n' },
      ['/w/a.ts', '/w/n.ts']
    ],
    ['create_file', { filePath: 'relative.ts' }, []],
    ['create_file', { filePath: 'file://host/%' }, []],
    ['read_file', { filePath: '/w/a.ts' }, []]
  ])('finds paths edited by %s', (tool, input, expected) => {
    expect(editPaths(tool, input)).toEqual(expected);
  });
});
