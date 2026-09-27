import { describe, expect, it } from 'vitest';

import { type LogSummary, toolStatuses } from '../src/sessions/projection';
import { TranscriptBuffer } from '../src/sessions/transcript';
import {
  type LogMark,
  pendingTurns,
  unloggedTurns,
  withUnlogged
} from '../src/sessions/unloggedTurns';
import { transcriptLine } from './fixtures';

const BASE = Date.UTC(2026, 0, 1);

function turnsOf(...lines: string[]) {
  const buffer = new TranscriptBuffer();
  buffer.append(lines);
  return buffer.turns();
}

const history = turnsOf(
  transcriptLine('user.message', { content: 'logged task' }, 10),
  transcriptLine('assistant.message', { content: 'logged reply' }, 12),
  transcriptLine('user.message', { content: 'phone task' }, 30),
  transcriptLine('assistant.message', { content: 'phone reply' }, 32),
  transcriptLine('user.message', { content: 'follow up' }, 40),
  transcriptLine('tool.execution_start', { toolCallId: 't', toolName: 'grep' }, 41)
);

function at(second: number): number {
  return BASE + second * 1000;
}

describe('unloggedTurns', () => {
  it.each<[string, LogMark, string[]]>([
    ['log saved after every turn', { writtenAt: at(50), lastRequestAt: at(39) }, []],
    [
      'log saved before the phone turn',
      { writtenAt: at(20), lastRequestAt: at(9) },
      ['phone task', 'follow up']
    ],
    [
      'log saved while the phone turn was starting',
      { writtenAt: at(29), lastRequestAt: at(28) },
      ['follow up']
    ],
    ['log without requests', { writtenAt: at(35), lastRequestAt: null }, ['follow up']]
  ])('%s', (_name, mark, expected) => {
    expect(unloggedTurns(history, mark).map((turn) => turn.content)).toEqual(expected);
  });
});

describe('pending overlay', () => {
  const turns = unloggedTurns(history, { writtenAt: at(20), lastRequestAt: at(9) });
  const summary: LogSummary = {
    id: 'session',
    title: 'Logged task',
    createdAt: at(0),
    updatedAt: at(20),
    status: 'idle',
    lastRequestState: 'complete',
    modelId: 'copilot/gpt-5',
    modeId: null,
    requestCount: 1,
    preview: 'logged task'
  };

  it.each<[boolean, string, string]>([
    [false, 'running', 'pending'],
    [true, 'idle', 'complete']
  ])('marks the summary with the newest message when settled is %s', (settled, status, state) => {
    expect(withUnlogged(summary, turns, settled)).toMatchObject({
      status,
      lastRequestState: state,
      requestCount: 3,
      updatedAt: at(40),
      preview: 'follow up'
    });
    expect(withUnlogged(summary, [], settled)).toBe(summary);
  });

  it('projects unlogged turns with their activity', () => {
    const statuses = toolStatuses(turns.flatMap((turn) => turn.events));
    const pending = pendingTurns(turns, 'copilot/gpt-5', statuses, false);
    expect(pending.map((request) => [request.message, request.state, request.parts])).toEqual([
      ['phone task', 'complete', [{ kind: 'markdown', text: 'phone reply' }]],
      [
        'follow up',
        'pending',
        [
          {
            kind: 'tool',
            callId: 't',
            toolId: 'grep',
            message: 'grep',
            detail: null,
            awaitingConfirmation: false,
            status: 'running',
            terminal: null
          }
        ]
      ]
    ]);
    expect(pendingTurns(turns, null, statuses, true).at(-1)?.state).toBe('complete');
  });
});
