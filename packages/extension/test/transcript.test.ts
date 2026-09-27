import type { HookEvent } from '@pocket-pilot/protocol';
import { describe, expect, it } from 'vitest';

import { toolStatuses } from '../src/sessions/projection';
import { TranscriptBuffer } from '../src/sessions/transcript';
import { transcriptLine } from './fixtures';

const BASE = Date.UTC(2026, 0, 1);

function at(second: number): number {
  return BASE + second * 1000;
}

function turnsOf(buffer: TranscriptBuffer): [string, string[]][] {
  return buffer.turns().map((turn) => [turn.content, turn.events.map((event) => event.type)]);
}

describe('TranscriptBuffer', () => {
  it('splits turns and keeps subagent prompts inside the parent turn', () => {
    const buffer = new TranscriptBuffer();
    buffer.append([
      transcriptLine('user.message', { content: 'parent task' }, 1),
      transcriptLine('assistant.message', { content: 'delegating' }, 2),
      transcriptLine(
        'tool.execution_start',
        { toolCallId: 's__vscode-7', toolName: 'runSubagent' },
        3
      ),
      transcriptLine('user.message', { content: 'subagent prompt' }, 4),
      transcriptLine('assistant.message', { content: 'subagent reply' }, 5),
      transcriptLine('tool.execution_complete', { toolCallId: 's', success: true }, 6),
      transcriptLine('assistant.message', { content: 'done' }, 7),
      'broken line'
    ]);
    expect(turnsOf(buffer)).toEqual([
      ['', []],
      ['parent task', ['message', 'toolStart', 'user', 'message', 'toolEnd', 'message']]
    ]);
    expect(toolStatuses(buffer.turns().flatMap((turn) => turn.events))).toEqual(
      new Map([['s', 'done']])
    );
  });

  it.each<[string, string[], string[]]>([
    ['no log yet', [], ['', 'first', 'second']],
    [
      'the logged prompt after the hook',
      [transcriptLine('user.message', { content: '<context/>\nsecond' }, 11)],
      ['', 'first', '<context/>\nsecond']
    ],
    [
      'the logged prompt just before the hook',
      [transcriptLine('user.message', { content: 'second' }, 9)],
      ['', 'first', 'second']
    ],
    [
      'an unrelated earlier prompt',
      [transcriptLine('user.message', { content: 'other' }, 5)],
      ['', 'first', 'other', 'second']
    ]
  ])('replaces a hooked prompt with %s', (_name, lines, expected) => {
    const buffer = new TranscriptBuffer();
    buffer.append([transcriptLine('user.message', { content: 'first' }, 1)]);
    buffer.hook({ kind: 'prompt', sessionId: 's', at: at(10), prompt: 'second' });
    buffer.append(lines);
    expect(buffer.turns().map((turn) => turn.content)).toEqual(expected);
  });

  it('dedupes hooked tools and closes running tools on stop', () => {
    const buffer = new TranscriptBuffer();
    const hooks: HookEvent[] = [
      { kind: 'prompt', sessionId: 's', at: at(1), prompt: 'go' },
      { kind: 'toolStart', sessionId: 's', at: at(2), callId: 'a', toolName: 'grep' },
      { kind: 'toolStart', sessionId: 's', at: at(4), callId: 'b', toolName: 'read' }
    ];
    for (const event of hooks) buffer.hook(event);
    buffer.append([
      transcriptLine('user.message', { content: 'go' }, 1),
      transcriptLine('tool.execution_start', { toolCallId: 'a', toolName: 'grep' }, 2),
      transcriptLine('tool.execution_complete', { toolCallId: 'a', success: false }, 3)
    ]);
    const events = (): string[][] =>
      buffer
        .turns()
        .flatMap((turn) => turn.events)
        .map((event) => [event.type, 'callId' in event ? event.callId : '']);
    expect(events()).toEqual([
      ['toolStart', 'a'],
      ['toolEnd', 'a'],
      ['toolStart', 'b']
    ]);
    buffer.hook({ kind: 'stop', sessionId: 's', at: at(9) });
    expect(toolStatuses(buffer.turns().flatMap((turn) => turn.events))).toEqual(
      new Map([
        ['a', 'failed'],
        ['b', 'done']
      ])
    );
  });
});
