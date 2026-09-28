import type { Question, ResponsePart, SessionDetail } from '@pocket-pilot/protocol';
import { describe, expect, it } from 'vitest';

import {
  answersError,
  confirmationPrompt,
  pendingQuestions,
  requirePendingElicitation
} from '../src/control/interactions';

const question = (overrides: Partial<Question>): Question => ({
  id: 'q',
  type: 'singleSelect',
  title: 'Shape',
  message: null,
  options: [
    { id: 'a', label: 'Round', value: 'round' },
    { id: 'b', label: 'Square', value: 'square' }
  ],
  defaultValue: null,
  allowFreeformInput: true,
  required: false,
  ...overrides
});

const questions = (items: Question[], allowSkip = true) =>
  ({
    kind: 'questions',
    resolveId: 'r1',
    allowSkip,
    state: 'pending',
    questions: items,
    answers: null
  }) as const;

const detail = (parts: ResponsePart[]): SessionDetail => ({
  id: 's',
  title: 'Chat',
  status: 'needsInput',
  modelId: null,
  modeId: null,
  permission: 'default',
  totalRequests: 1,
  editedFiles: 0,
  todos: null,
  requests: [
    { id: 'r', timestamp: 0, message: 'go', modelId: null, state: 'needsInput', error: null, parts }
  ],
  queued: []
});

describe('interactions', () => {
  it.each([
    ['skip allowed', [question({})], true, null, null],
    ['skip refused', [question({})], false, null, 'These questions cannot be skipped'],
    ['unknown question', [question({})], true, { other: 'x' }, 'Unknown question'],
    ['required missing', [question({ required: true })], true, {}, 'Shape needs an answer'],
    ['optional missing', [question({})], true, {}, null],
    ['text answer', [question({ type: 'text' })], true, { q: 'hello' }, null],
    [
      'text needs string',
      [question({ type: 'text' })],
      true,
      { q: { selectedValue: 'round' } },
      'Shape needs a text answer'
    ],
    ['single choice', [question({})], true, { q: { selectedValue: 'round' } }, null],
    [
      'single with list',
      [question({})],
      true,
      { q: { selectedValues: ['round'] } },
      'Shape takes one choice'
    ],
    [
      'unknown choice',
      [question({})],
      true,
      { q: { selectedValue: 'oval' } },
      'Shape has an unknown choice'
    ],
    [
      'multi choice',
      [question({ type: 'multiSelect' })],
      true,
      { q: { selectedValues: ['round', 'square'] } },
      null
    ],
    [
      'multi with single',
      [question({ type: 'multiSelect' })],
      true,
      { q: { selectedValue: 'round' } },
      'Shape takes a list of choices'
    ],
    [
      'freeform allowed',
      [question({ required: true })],
      true,
      { q: { freeformValue: 'Oval' } },
      null
    ],
    [
      'freeform refused',
      [question({ allowFreeformInput: false })],
      true,
      { q: { freeformValue: 'Oval' } },
      'Shape does not accept free text'
    ],
    [
      'blank freeform for required',
      [question({ required: true })],
      true,
      { q: { freeformValue: '  ' } },
      'Shape needs an answer'
    ]
  ])('validates %s', (_name, items, allowSkip, answers, expected) => {
    expect(answersError(questions(items, allowSkip), answers)).toBe(expected);
  });

  it('finds only pending questions in the latest request', () => {
    const part = questions([question({})]);
    expect(pendingQuestions(detail([part]), 'r1')).toBe(part);
    expect(() => pendingQuestions(detail([{ ...part, state: 'done' }]), 'r1')).toThrow(
      'no longer waiting'
    );
    expect(() => pendingQuestions(detail([part]), 'other')).toThrow('no longer waiting');
  });

  it('builds the confirmation prompt', () => {
    const part: Extract<ResponsePart, { kind: 'confirmation' }> = {
      kind: 'confirmation',
      title: 'Continue to iterate?',
      message: '',
      buttons: ['Continue', 'Pause'],
      state: 'pending'
    };
    expect(confirmationPrompt(detail([part]), 'Pause')).toBe('Pause: "Continue to iterate?"');
    expect(() => confirmationPrompt(detail([part]), 'Stop')).toThrow('Unknown confirmation');
    expect(() => confirmationPrompt(detail([{ ...part, state: 'done' }]), 'Pause')).toThrow(
      'Nothing is waiting'
    );
  });

  it('requires a pending elicitation', () => {
    const part = { kind: 'elicitation', title: 'Run?', message: '', state: 'pending' } as const;
    expect(() => requirePendingElicitation(detail([part]))).not.toThrow();
    expect(() => requirePendingElicitation(detail([{ ...part, state: 'accepted' }]))).toThrow();
    expect(() => requirePendingElicitation(null)).toThrow();
  });
});
