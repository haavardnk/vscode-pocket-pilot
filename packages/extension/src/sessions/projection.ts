import {
  type InteractionState,
  type OptionValue,
  optionValueSchema,
  type PermissionLevel,
  permissionLevelSchema,
  type Question,
  questionAnswersSchema,
  type QueuedRequest,
  type RequestImage,
  type RequestState,
  type RequestView,
  type ResponsePart,
  type SessionDetail,
  type SessionStatus,
  type SessionSummary,
  type ToolStatus
} from '@pocket-pilot/protocol';

import { asArray, asNumber, asRecord, asString, type JsonRecord, markdownText } from '../json';
import { type Activity, withActivity } from './activityParts';
import { withoutEditFences } from './editFences';
import { markdownBase, referenceHref } from './fileLinks';
import { basename, clip, plainMessage } from './partText';
import { requestImages } from './requestImages';
import { sessionTodos } from './todos';
import { projectTool, writtenPaths } from './toolParts';
import { toolCallId } from './transcript';

const TITLE_LENGTH = 80;
const PREVIEW_LENGTH = 160;

export type LogSummary = Omit<SessionSummary, 'pinned' | 'archived'>;

interface PartContext {
  state: RequestState;
  latest: boolean;
  statuses: ReadonlyMap<string, ToolStatus>;
  stopId: string | null;
  callId: string | null;
  writers: Map<string, string>;
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

function projectPart(part: JsonRecord, context: PartContext): ResponsePart | null {
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

function mergeParts(parts: ResponsePart[]): ResponsePart[] {
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

function projectRequest(request: JsonRecord, latest: boolean, activity: Activity): RequestView {
  const logged = requestState(request);
  const state = latest && activity.settled && logged === 'pending' ? 'complete' : logged;
  const context: PartContext = {
    state,
    latest,
    statuses: activity.statuses,
    stopId: null,
    callId: null,
    writers: new Map()
  };
  const parts = withoutEditFences(asArray(request.response).map(asRecord)).flatMap((part) => {
    if (part.kind === 'undoStop') context.stopId = asString(part.id);
    const paths = part.kind === 'toolInvocationSerialized' ? writtenPaths(part) : null;
    const raw = asString(part.toolCallId);
    if (paths && raw) {
      const callId = toolCallId(raw);
      context.callId = callId;
      for (const path of paths) context.writers.set(path, callId);
    }
    const projected = projectPart(part, context);
    return projected ? [projected] : [];
  });
  const error = asRecord(asRecord(request.result).errorDetails);
  const id = asString(request.requestId) ?? '';
  return {
    id,
    timestamp: asNumber(request.timestamp) ?? 0,
    message: requestText(request),
    modelId: asString(request.modelId),
    agentName: asString(asRecord(asRecord(request.modeInfo).modeInstructions).name),
    state,
    error: state === 'failed' ? (asString(error.message) ?? 'Request failed') : null,
    editable: id !== '',
    disabled: false,
    editedPaths: [],
    images: requestImages(request),
    parts: mergeParts(parts)
  };
}

function attachmentCount(request: JsonRecord, images: readonly RequestImage[]): number {
  return asArray(asRecord(request.variableData).variables).filter((raw) => {
    const variable = asRecord(raw);
    const id = asString(variable.id) ?? '';
    return (
      variable.kind !== 'implicit' &&
      variable.kind !== 'workspace' &&
      !id.startsWith('vscode.implicit') &&
      variable.automaticallyAdded !== true &&
      variable.range === undefined &&
      !images.some((image) => image.id === id)
    );
  }).length;
}

function queuedMode(modeInfo: JsonRecord): string | null {
  if (modeInfo.isBuiltin === false) {
    return asString(asRecord(asRecord(modeInfo.modeInstructions).uri).external);
  }
  return asString(modeInfo.modeId) ?? asString(modeInfo.telemetryModeId);
}

export function pendingRequest(root: unknown, id: string): JsonRecord | null {
  const pending = asArray(asRecord(root).pendingRequests)
    .map(asRecord)
    .find((candidate) => candidate.id === id);
  return pending ? asRecord(pending.request) : null;
}

function projectQueued(root: JsonRecord): QueuedRequest[] {
  return asArray(root.pendingRequests).map((raw) => {
    const pending = asRecord(raw);
    const request = asRecord(pending.request);
    const options = asRecord(pending.sendOptions);
    const modeInfo = asRecord(options.modeInfo ?? request.modeInfo);
    const permission = permissionLevelSchema.safeParse(modeInfo.permissionLevel);
    const images = requestImages(request);
    return {
      id: asString(pending.id) ?? '',
      delivery: pending.kind === 'steering' ? 'steering' : 'queued',
      text: requestText(request),
      modeId: queuedMode(modeInfo),
      modelId: asString(options.userSelectedModelId),
      permission: permission.success ? permission.data : null,
      images,
      attachments: attachmentCount(request, images)
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
    todos: sessionTodos(requests),
    requests: [...views, ...unlogged],
    queued: projectQueued(session)
  };
}
