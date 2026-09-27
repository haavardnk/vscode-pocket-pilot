import type { Question } from '@pocket-pilot/protocol';
import { describe, expect, it } from 'vitest';

import { answerSummary, collectAnswers, draftAnswer, initialDraft } from '../src/lib/hub/questions';

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

describe('questions', () => {
  it.each([
    [question({ defaultValue: 'round' }), { selected: ['round'], freeform: '' }],
    [question({ defaultValue: 'oval' }), { selected: [], freeform: '' }],
    [
      question({ type: 'multiSelect', defaultValue: ['round', 'square'] }),
      { selected: ['round', 'square'], freeform: '' }
    ],
    [question({ type: 'text', defaultValue: 'hi' }), { selected: [], freeform: 'hi' }]
  ])('starts from defaults %#', (item, expected) => {
    expect(initialDraft(item)).toEqual(expected);
  });

  it.each([
    [question({ type: 'text' }), { selected: [], freeform: ' hi ' }, 'hi'],
    [question({ type: 'text' }), { selected: [], freeform: '  ' }, undefined],
    [question({}), { selected: ['round'], freeform: '' }, { selectedValue: 'round' }],
    [question({}), { selected: [], freeform: 'Oval' }, { freeformValue: 'Oval' }],
    [question({}), { selected: [], freeform: '' }, undefined],
    [
      question({ type: 'multiSelect' }),
      { selected: ['round'], freeform: 'Oval' },
      { selectedValues: ['round'], freeformValue: 'Oval' }
    ],
    [question({ type: 'multiSelect' }), { selected: [], freeform: '' }, undefined]
  ])('builds answers %#', (item, draft, expected) => {
    expect(draftAnswer(item, draft)).toEqual(expected);
  });

  it('reports incomplete required answers', () => {
    const items = [question({ id: 'a', required: true }), question({ id: 'b', type: 'text' })];
    const empty = collectAnswers(items, initialDraft);
    expect(empty).toEqual({ answers: {}, complete: false });
    const filled = collectAnswers(items, (item) =>
      item.id === 'a' ? { selected: ['square'], freeform: '' } : initialDraft(item)
    );
    expect(filled).toEqual({ answers: { a: { selectedValue: 'square' } }, complete: true });
  });

  it.each([
    [question({}), { selectedValue: 'round' }, 'Round'],
    [
      question({ type: 'multiSelect' }),
      { selectedValues: ['round', 'x'], freeformValue: 'Oval' },
      'Round, x, Oval'
    ],
    [question({ type: 'text' }), 'Hello', 'Hello'],
    [question({}), undefined, 'No answer']
  ])('summarizes answers %#', (item, answer, expected) => {
    expect(answerSummary(item, answer)).toBe(expected);
  });
});
