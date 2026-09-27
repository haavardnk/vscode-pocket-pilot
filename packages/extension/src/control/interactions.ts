import type {
  PermissionLevel,
  Question,
  QuestionAnswer,
  QuestionAnswers,
  ResponsePart,
  SessionDetail
} from '@pocket-pilot/protocol';

type QuestionsPart = Extract<ResponsePart, { kind: 'questions' }>;
type ConfirmationPart = Extract<ResponsePart, { kind: 'confirmation' }>;

export const PERMISSION_COMMANDS: Record<PermissionLevel, string> = {
  default: '/disableAutoApprove',
  autoApprove: '/autoApprove',
  autopilot: '/autopilot'
};

function latestParts(detail: SessionDetail | null): ResponsePart[] {
  return detail?.requests.at(-1)?.parts ?? [];
}

function answerError(question: Question, answer: QuestionAnswer | undefined): string | null {
  if (answer === undefined) return question.required ? `${question.title} needs an answer` : null;
  if (question.type === 'text') {
    return typeof answer === 'string' ? null : `${question.title} needs a text answer`;
  }
  if (typeof answer === 'string') return `${question.title} needs a choice`;
  const multiple = 'selectedValues' in answer;
  if (multiple !== (question.type === 'multiSelect')) {
    return `${question.title} takes ${multiple ? 'one choice' : 'a list of choices'}`;
  }
  const selected = multiple
    ? answer.selectedValues
    : answer.selectedValue === undefined
      ? []
      : [answer.selectedValue];
  if (selected.some((value) => !question.options.some((option) => option.value === value))) {
    return `${question.title} has an unknown choice`;
  }
  const freeform = answer.freeformValue?.trim() ?? '';
  if (freeform && !question.allowFreeformInput) {
    return `${question.title} does not accept free text`;
  }
  if (question.required && selected.length === 0 && !freeform) {
    return `${question.title} needs an answer`;
  }
  return null;
}

export function pendingQuestions(detail: SessionDetail | null, resolveId: string): QuestionsPart {
  const part = latestParts(detail).find(
    (candidate): candidate is QuestionsPart =>
      candidate.kind === 'questions' && candidate.resolveId === resolveId
  );
  if (!part || part.state !== 'pending') throw new Error('The questions are no longer waiting');
  return part;
}

export function answersError(part: QuestionsPart, answers: QuestionAnswers | null): string | null {
  if (answers === null) return part.allowSkip ? null : 'These questions cannot be skipped';
  if (Object.keys(answers).some((id) => !part.questions.some((question) => question.id === id))) {
    return 'Unknown question';
  }
  for (const question of part.questions) {
    const error = answerError(question, answers[question.id]);
    if (error) return error;
  }
  return null;
}

export function confirmationPrompt(detail: SessionDetail | null, button: string): string {
  const part = latestParts(detail).findLast(
    (candidate): candidate is ConfirmationPart =>
      candidate.kind === 'confirmation' && candidate.state === 'pending'
  );
  if (!part) throw new Error('Nothing is waiting for confirmation');
  if (!part.buttons.includes(button)) throw new Error('Unknown confirmation button');
  return `${button}: "${part.title}"`;
}

export function requirePendingElicitation(detail: SessionDetail | null): void {
  if (
    !latestParts(detail).some((part) => part.kind === 'elicitation' && part.state === 'pending')
  ) {
    throw new Error('Nothing is waiting for approval');
  }
}
