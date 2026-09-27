import type {
  OptionValue,
  Question,
  QuestionAnswer,
  QuestionAnswers
} from '@pocket-pilot/protocol';

export interface Draft {
  selected: OptionValue[];
  freeform: string;
}

export function initialDraft(question: Question): Draft {
  const defaults = question.defaultValue;
  if (question.type === 'text') {
    return { selected: [], freeform: typeof defaults === 'string' ? defaults : '' };
  }
  const selected = Array.isArray(defaults) ? defaults : defaults === null ? [] : [defaults];
  return {
    selected: selected.filter((value) => question.options.some((option) => option.value === value)),
    freeform: ''
  };
}

export function draftAnswer(question: Question, draft: Draft): QuestionAnswer | undefined {
  const freeform = draft.freeform.trim();
  if (question.type === 'text') return freeform ? freeform : undefined;
  const extra = freeform ? { freeformValue: freeform } : {};
  if (question.type === 'multiSelect') {
    return draft.selected.length > 0 || freeform
      ? { selectedValues: draft.selected, ...extra }
      : undefined;
  }
  const selectedValue = draft.selected[0];
  if (selectedValue === undefined) return freeform ? extra : undefined;
  return { selectedValue, ...extra };
}

export function collectAnswers(
  questions: readonly Question[],
  draftFor: (question: Question) => Draft
): { answers: QuestionAnswers; complete: boolean } {
  const answers: QuestionAnswers = {};
  let complete = true;
  for (const question of questions) {
    const answer = draftAnswer(question, draftFor(question));
    if (answer === undefined) complete &&= !question.required;
    else answers[question.id] = answer;
  }
  return { answers, complete };
}

export function answerSummary(question: Question, answer: QuestionAnswer | undefined): string {
  if (answer === undefined) return 'No answer';
  if (typeof answer === 'string') return answer;
  const values = 'selectedValues' in answer ? answer.selectedValues : [answer.selectedValue];
  const labels = values
    .filter((value) => value !== undefined)
    .map(
      (value) => question.options.find((option) => option.value === value)?.label ?? String(value)
    );
  return [...labels, answer.freeformValue].filter(Boolean).join(', ') || 'No answer';
}
