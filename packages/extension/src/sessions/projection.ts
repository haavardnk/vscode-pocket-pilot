import {
  type InteractionState,
  type OptionValue,
  optionValueSchema,
  type PermissionLevel,
  permissionLevelSchema,
  type Question,
  questionAnswersSchema,
  type QueuedRequest,
  type RequestState,
  type RequestView,
  type ResponsePart,
  type SessionDetail,
  type SessionStatus,
  type SessionSummary,
  type ToolStatus
} from '@pocket-pilot/protocol';

import { asArray, asNumber, asRecord, asString, type JsonRecord, markdownText } from '../json';
import type { TranscriptEvent } from './transcript';

const TITLE_LENGTH = 80;
const PREVIEW_LENGTH = 160;
const DETAIL_LENGTH = 4000;
const LINK = /\[([^\]]*)\]\(([^)\s]+)\)/g;

export type LogSummary = Omit<SessionSummary, 'pinned' | 'archived'>;

type ActivityPart = Extract<ResponsePart, { kind: 'tool' | 'thinking' | 'markdown' }>;

export interface Activity {
  statuses: ReadonlyMap<string, ToolStatus>;
  events: readonly TranscriptEvent[];
  toolsOnly: boolean;
  settled: boolean;
}

interface PartContext {
  state: RequestState;
  latest: boolean;
  statuses: ReadonlyMap<string, ToolStatus>;
}

function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  return decodeURIComponent(trimmed.slice(trimmed.lastIndexOf('/') + 1));
}

export function plainMessage(value: unknown): string {
  return markdownText(value)
    .replace(LINK, (_match, label: string, target: string) => label || basename(target))
    .replace(/\$\([\w-]+\)\s*/g, '')
    .trim();
}

function clip(text: string, length: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
}

export function titleText(text: string): string {
  return clip(text, TITLE_LENGTH) || 'New chat';
}

export function previewText(text: string): string | null {
  return clip(text, PREVIEW_LENGTH) || null;
}

function requestsOf(root: unknown): JsonRecord[] {
  return asArray(asRecord(root).requests).map(asRecord);
}

export function lastRequestAt(root: unknown): number | null {
  return asNumber(requestsOf(root).at(-1)?.timestamp);
}

export function requestText(request: JsonRecord): string {
  return asString(asRecord(request.message).text) ?? '';
}

export function requestState(request: JsonRecord): RequestState {
  const value = asNumber(asRecord(request.modelState).value);
  const error = asRecord(asRecord(request.result).errorDetails);
  if (value === 0) return 'pending';
  if (value === 2) return 'cancelled';
  if (value === 3) return 'failed';
  if (value === 4) return 'needsInput';
  if (asString(error.message) && error.code !== 'canceled') return 'failed';
  return 'complete';
}

function statusOf(state: RequestState | null): SessionStatus {
  if (state === 'pending') return 'running';
  if (state === 'needsInput') return 'needsInput';
  if (state === 'failed') return 'failed';
  return 'idle';
}

function sessionModel(root: JsonRecord, last: JsonRecord | undefined): string | null {
  const selected = asString(asRecord(asRecord(root.inputState).selectedModel).identifier);
  return selected ?? (last ? asString(last.modelId) : null);
}

function sessionMode(root: JsonRecord): string | null {
  return asString(asRecord(asRecord(root.inputState).mode).id);
}

function sessionPermission(root: JsonRecord): PermissionLevel {
  const level = permissionLevelSchema.safeParse(asRecord(root.inputState).permissionLevel);
  return level.success ? level.data : 'default';
}

function titleOf(root: JsonRecord, requests: JsonRecord[]): string {
  const custom = asString(root.customTitle);
  if (custom) return custom;
  const first = requests[0];
  return first ? titleText(requestText(first)) : 'New chat';
}

export function projectSummary(root: unknown, id: string, modifiedAt: number): LogSummary {
  const session = asRecord(root);
  const requests = requestsOf(session);
  const last = requests.at(-1);
  const created = asNumber(session.creationDate) ?? modifiedAt;
  const state = last ? requestState(last) : null;
  return {
    id,
    title: titleOf(session, requests),
    createdAt: created,
    updatedAt: Math.max(modifiedAt, asNumber(last?.timestamp) ?? created),
    status: statusOf(state),
    lastRequestState: state,
    modelId: sessionModel(session, last),
    modeId: sessionMode(session),
    requestCount: requests.length,
    preview: last ? previewText(requestText(last)) : null
  };
}

function referenceName(part: JsonRecord): string {
  const name = asString(part.name);
  if (name) return name;
  const reference = asRecord(part.inlineReference);
  const path = asString(reference.path) ?? asString(asRecord(reference.uri).path) ?? '';
  return basename(path);
}

function thinkingText(value: unknown): string {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string').join('')
    : markdownText(value);
}

function toolDetail(value: unknown): string | null {
  const data = asRecord(value);
  if (data.kind === 'terminal') {
    const command = asRecord(data.commandLine);
    const text =
      asString(command.forDisplay) ?? asString(command.toolEdited) ?? asString(command.original);
    return text?.trim() || null;
  }
  if (data.kind === 'input' && data.rawInput !== undefined) {
    return clip(JSON.stringify(data.rawInput), DETAIL_LENGTH);
  }
  return null;
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

function projectPart(part: JsonRecord, context: PartContext): ResponsePart | null {
  const awaitingInput = context.state === 'needsInput';
  switch (part.kind) {
    case undefined:
    case 'markdownContent': {
      const text = markdownText(part.kind === undefined ? part.value : part.content);
      return text ? { kind: 'markdown', text } : null;
    }
    case 'inlineReference':
      return { kind: 'markdown', text: `\`${referenceName(part)}\`` };
    case 'thinking': {
      const text = thinkingText(part.value).trim();
      return text ? { kind: 'thinking', text, title: asString(part.generatedTitle) } : null;
    }
    case 'toolInvocationSerialized':
      return {
        kind: 'tool',
        callId: asString(part.toolCallId) ?? '',
        toolId: asString(part.toolId) ?? '',
        message: plainMessage(part.pastTenseMessage) || plainMessage(part.invocationMessage),
        detail: toolDetail(part.toolSpecificData),
        awaitingConfirmation: awaitingInput && part.isConfirmed == null,
        status: context.statuses.get(asString(part.toolCallId) ?? '') ?? 'done',
        terminal: null
      };
    case 'textEditGroup':
    case 'notebookEditGroup': {
      const uri = asRecord(part.uri);
      const path = asString(uri.fsPath) ?? asString(uri.path);
      return path ? { kind: 'edit', path } : null;
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

function mergeParts(parts: ResponsePart[]): ResponsePart[] {
  const merged: ResponsePart[] = [];
  for (const part of parts) {
    const previous = merged.at(-1);
    if (previous?.kind === 'markdown' && part.kind === 'markdown') {
      merged[merged.length - 1] = { kind: 'markdown', text: previous.text + part.text };
    } else if (!(
      previous?.kind === 'edit' &&
      part.kind === 'edit' &&
      previous.path === part.path
    )) {
      merged.push(part);
    }
  }
  return merged;
}

function projectRequest(request: JsonRecord, latest: boolean, activity: Activity): RequestView {
  const logged = requestState(request);
  const state = latest && activity.settled && logged === 'pending' ? 'complete' : logged;
  const parts = asArray(request.response)
    .map((part) => projectPart(asRecord(part), { state, latest, statuses: activity.statuses }))
    .filter((part): part is ResponsePart => part !== null);
  const error = asRecord(asRecord(request.result).errorDetails);
  return {
    id: asString(request.requestId) ?? '',
    timestamp: asNumber(request.timestamp) ?? 0,
    message: requestText(request),
    modelId: asString(request.modelId),
    state,
    error: state === 'failed' ? (asString(error.message) ?? 'Request failed') : null,
    parts: mergeParts(parts)
  };
}

function projectQueued(root: JsonRecord): QueuedRequest[] {
  return asArray(root.pendingRequests).map((raw) => {
    const pending = asRecord(raw);
    return {
      id: asString(pending.id) ?? '',
      delivery: pending.kind === 'steering' ? 'steering' : 'queued',
      text: requestText(asRecord(pending.request))
    };
  });
}

export function editedPaths(root: unknown): string[] {
  const paths = requestsOf(root).flatMap((request) =>
    asArray(request.response).flatMap((raw) => {
      const part = asRecord(raw);
      if (part.kind !== 'textEditGroup' && part.kind !== 'notebookEditGroup') return [];
      const uri = asRecord(part.uri);
      const path = asString(uri.fsPath) ?? asString(uri.path);
      return path && (uri.scheme ?? 'file') === 'file' ? [path] : [];
    })
  );
  return [...new Set(paths)];
}

export function toolStatuses(events: readonly TranscriptEvent[]): Map<string, ToolStatus> {
  const statuses = new Map<string, ToolStatus>();
  for (const event of events) {
    if (event.type === 'toolStart' && !statuses.has(event.callId)) {
      statuses.set(event.callId, 'running');
    }
    if (event.type === 'toolEnd') statuses.set(event.callId, event.success ? 'done' : 'failed');
  }
  return statuses;
}

export function activityParts(
  events: readonly TranscriptEvent[],
  statuses: ReadonlyMap<string, ToolStatus>,
  toolsOnly: boolean
): ActivityPart[] {
  const running = new Set<string>();
  const parts: ActivityPart[] = [];
  for (const event of events) {
    if (event.type === 'toolStart') {
      running.add(event.callId);
      parts.push({
        kind: 'tool',
        callId: event.callId,
        toolId: event.name,
        message: event.name,
        detail: event.args && clip(event.args, DETAIL_LENGTH),
        awaitingConfirmation: false,
        status: statuses.get(event.callId) ?? 'running',
        terminal: null
      });
    } else if (event.type === 'toolEnd') {
      running.delete(event.callId);
    } else if (event.type === 'message' && running.size === 0 && !toolsOnly) {
      const reasoning = event.reasoning?.trim();
      if (reasoning) parts.push({ kind: 'thinking', text: reasoning, title: null });
      if (event.text) parts.push({ kind: 'markdown', text: event.text });
    }
  }
  return parts;
}

function withActivity(parts: ResponsePart[], activity: Activity): ResponsePart[] {
  const tools = new Set(parts.flatMap((part) => (part.kind === 'tool' ? [part.callId] : [])));
  const shown = parts
    .map((part) => (part.kind === 'markdown' || part.kind === 'thinking' ? part.text : ''))
    .join('\n');
  const extra = activityParts(activity.events, activity.statuses, activity.toolsOnly).filter(
    (part) => (part.kind === 'tool' ? !tools.has(part.callId) : !shown.includes(part.text.trim()))
  );
  return [...parts, ...extra];
}

export function projectDetail(
  root: unknown,
  summary: LogSummary,
  limit: number,
  activity: Activity,
  pending: RequestView[]
): SessionDetail {
  const session = asRecord(root);
  const requests = requestsOf(session);
  const last = pending.length > 0 ? undefined : requests.at(-1);
  const unlogged = pending.slice(-limit);
  const shown = requests.slice(Math.max(0, requests.length - limit + unlogged.length));
  const active = summary.status === 'running' || summary.status === 'needsInput';
  const views = shown.map((request) => {
    const view = projectRequest(request, request === last, activity);
    return request === last && active
      ? { ...view, parts: withActivity(view.parts, activity) }
      : view;
  });
  return {
    id: summary.id,
    title: summary.title,
    status: summary.status,
    modelId: summary.modelId,
    modeId: summary.modeId,
    permission: sessionPermission(session),
    totalRequests: requests.length + pending.length,
    editedFiles: editedPaths(session).length,
    requests: [...views, ...unlogged],
    queued: projectQueued(session)
  };
}
