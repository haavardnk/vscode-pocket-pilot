import {
  type InteractionState,
  type OptionValue,
  optionValueSchema,
  type Question,
  questionAnswersSchema,
  type RequestState,
  type ResponsePart,
  type ToolStatus
} from '@pocket-pilot/protocol';

import { asArray, asNumber, asRecord, asString, type JsonRecord, markdownText } from '../json';
import { markdownBase, referenceHref } from './fileLinks';
import { basename, plainMessage } from './partText';
import { projectTool } from './toolParts';

export interface PartContext {
  state: RequestState;
  latest: boolean;
  statuses: ReadonlyMap<string, ToolStatus>;
  stopId: string | null;
  callId: string | null;
  writers: Map<string, string>;
}

function referenceName(part: JsonRecord): string {
  const reference = asRecord(part.inlineReference);
  const name = asString(part.name) ?? asString(reference.name);
  if (name) return name;
  const label = basename(asString(asRecord(reference.uri ?? reference).path) ?? '');
  const range = asRecord(reference.range);
  const start = asNumber(range.startLineNumber);
  const end = asNumber(range.endLineNumber);
  if (!label || start === null) return label;
  return start === end ? `${label}:${start}` : `${label}:${start}-${end}`;
}

function thinkingText(value: unknown): string {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string').join('')
    : markdownText(value);
}

function optionValue(value: unknown): OptionValue | null {
  const parsed = optionValueSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function projectQuestion(value: unknown): Question | null {
  const question = asRecord(value);
  const id = asString(question.id);
  const type = question.type;
  if (!id || (type !== 'text' && type !== 'singleSelect' && type !== 'multiSelect')) return null;
  const defaults = Array.isArray(question.defaultValue)
    ? question.defaultValue.map(optionValue).filter((item) => item !== null)
    : optionValue(question.defaultValue);
  return {
    id,
    type,
    title: asString(question.title) ?? '',
    message: markdownText(question.message) || null,
    options: asArray(question.options).flatMap((raw) => {
      const option = asRecord(raw);
      const value = optionValue(option.value);
      if (value === null) return [];
      const label = asString(option.label) ?? String(value);
      return [{ id: asString(option.id) ?? label, label, value }];
    }),
    defaultValue: defaults,
    allowFreeformInput: question.allowFreeformInput !== false,
    required: question.required === true
  };
}

function interactionState(part: JsonRecord, pending: boolean): InteractionState {
  if (part.isUsed === true) return 'done';
  return pending ? 'pending' : 'expired';
}

function projectElicitation(
  part: JsonRecord,
  context: PartContext
): Extract<ResponsePart, { kind: 'elicitation' }> {
  const state = asString(part.state);
  return {
    kind: 'elicitation',
    title: plainMessage(part.title),
    message: markdownText(part.message),
    state:
      state === 'accepted' || state === 'rejected'
        ? state
        : context.state === 'needsInput'
          ? 'pending'
          : 'expired'
  };
}

export function projectPart(part: JsonRecord, context: PartContext): ResponsePart | null {
  const awaitingInput = context.state === 'needsInput';
  switch (part.kind) {
    case undefined:
    case 'markdownContent': {
      const markdown = part.kind === undefined ? part : asRecord(part.content);
      const text = markdownText(markdown);
      return text ? { kind: 'markdown', text, baseUri: markdownBase(markdown) } : null;
    }
    case 'inlineReference': {
      const name = referenceName(part);
      if (!name) return null;
      const href = referenceHref(part);
      return {
        kind: 'markdown',
        text: href ? `[\`${name}\`](${href})` : `\`${name}\``,
        baseUri: null
      };
    }
    case 'thinking': {
      const text = thinkingText(part.value).trim();
      return text ? { kind: 'thinking', text, title: asString(part.generatedTitle) } : null;
    }
    case 'toolInvocationSerialized':
      return projectTool(
        part,
        awaitingInput && part.isConfirmed == null,
        context.statuses.get(asString(part.toolCallId) ?? '')
      );
    case 'textEditGroup':
    case 'notebookEditGroup': {
      const uri = asRecord(part.uri);
      const path = asString(uri.fsPath) ?? asString(uri.path);
      return path
        ? {
            kind: 'edit',
            path,
            stopId: context.stopId,
            callId: context.writers.get(path) ?? context.callId,
            additions: null,
            deletions: null
          }
        : null;
    }
    case 'progressTaskSerialized': {
      const text = plainMessage(asRecord(part.content).value);
      return text ? { kind: 'progress', text } : null;
    }
    case 'questionCarousel': {
      const answers = questionAnswersSchema.safeParse(part.data);
      return {
        kind: 'questions',
        resolveId: asString(part.resolveId),
        allowSkip: part.allowSkip === true,
        state: interactionState(part, awaitingInput),
        questions: asArray(part.questions)
          .map(projectQuestion)
          .filter((question) => question !== null),
        answers: answers.success && Object.keys(answers.data).length > 0 ? answers.data : null
      };
    }
    case 'confirmation':
      return {
        kind: 'confirmation',
        title: asString(part.title) ?? '',
        message: markdownText(part.message),
        buttons: asArray(part.buttons).filter((button) => typeof button === 'string'),
        state: interactionState(
          part,
          context.latest && (context.state === 'complete' || awaitingInput)
        )
      };
    case 'elicitation2':
    case 'elicitationSerialized':
      return projectElicitation(part, context);
    default:
      return null;
  }
}

export function mergeParts(parts: ResponsePart[]): ResponsePart[] {
  const merged: ResponsePart[] = [];
  for (const part of parts) {
    const previous = merged.at(-1);
    if (previous?.kind === 'markdown' && part.kind === 'markdown') {
      merged[merged.length - 1] = {
        kind: 'markdown',
        text: previous.text + part.text,
        baseUri: previous.baseUri ?? part.baseUri
      };
    } else if (!(
      previous?.kind === 'edit' &&
      part.kind === 'edit' &&
      previous.path === part.path &&
      previous.stopId === part.stopId
    )) {
      merged.push(part);
    }
  }
  return merged;
}
