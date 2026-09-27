import { describe, expect, it } from 'vitest';

import { TranscriptBuffer } from '../src/sessions/transcript';
import { transcriptLine } from './fixtures';

describe('TranscriptBuffer', () => {
  const lines = [
    transcriptLine('user.message', { content: 'first task' }, 1),
    transcriptLine('assistant.message', { content: 'old reply' }, 2),
    transcriptLine('user.message', { content: '<context/>\nsecond task' }, 3),
    transcriptLine('assistant.turn_start', {}, 4),
    transcriptLine('assistant.message', { content: '', reasoningText: 'thinking' }, 5),
    transcriptLine('tool.execution_start', { toolCallId: 't1', toolName: 'read_file' }, 6),
    transcriptLine('tool.execution_start', { toolCallId: 't2', toolName: 'grep' }, 7),
    transcriptLine('tool.execution_complete', { toolCallId: 't1', success: true }, 8),
    transcriptLine('tool.execution_complete', { toolCallId: 't2', success: false }, 9),
    'broken line'
  ];

  it.each([['second task'], ['not present']])('folds events after the request %s', (text) => {
    const buffer = new TranscriptBuffer();
    buffer.append(lines);
    expect(
      buffer.liveFor(text).map((event) => [event.kind, 'state' in event && event.state])
    ).toEqual([
      ['message', false],
      ['tool', 'succeeded'],
      ['tool', 'failed']
    ]);
  });

  it('stops at the next request', () => {
    const buffer = new TranscriptBuffer();
    buffer.append(lines);
    expect(buffer.liveFor('first task')).toEqual([
      { kind: 'message', at: Date.UTC(2026, 0, 1, 0, 0, 2), text: 'old reply', reasoning: null }
    ]);
  });
});
