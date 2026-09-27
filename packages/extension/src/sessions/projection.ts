import type {
  LiveEvent,
  QueuedRequest,
  RequestState,
  RequestView,
  ResponsePart,
  SessionDetail,
  SessionStatus,
  SessionSummary
} from '@pocket-pilot/protocol';

import { asArray, asNumber, asRecord, asString, type JsonRecord, markdownText } from '../json';

const TITLE_LENGTH = 80;
const PREVIEW_LENGTH = 160;
const LINK = /\[([^\]]*)\]\(([^)\s]+)\)/g;

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

function requestsOf(root: unknown): JsonRecord[] {
  return asArray(asRecord(root).requests).map(asRecord);
}

function requestText(request: JsonRecord): string {
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

function titleOf(root: JsonRecord, requests: JsonRecord[]): string {
  const custom = asString(root.customTitle);
  if (custom) return custom;
  const first = requests[0];
  return first ? clip(requestText(first), TITLE_LENGTH) || 'New chat' : 'New chat';
}

export function projectSummary(root: unknown, id: string, modifiedAt: number): SessionSummary {
  const session = asRecord(root);
  const requests = requestsOf(session);
  const last = requests.at(-1);
  const created = asNumber(session.creationDate) ?? modifiedAt;
  return {
    id,
    title: titleOf(session, requests),
    createdAt: created,
    updatedAt: Math.max(modifiedAt, asNumber(last?.timestamp) ?? created),
    status: statusOf(last ? requestState(last) : null),
    modelId: sessionModel(session, last),
    modeId: sessionMode(session),
    requestCount: requests.length,
    preview: last ? clip(requestText(last), PREVIEW_LENGTH) || null : null
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

function projectPart(part: JsonRecord, awaitingInput: boolean): ResponsePart | null {
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
        awaitingConfirmation: awaitingInput && part.isConfirmed == null
      };
    case 'textEditGroup':
    case 'notebookEditGroup': {
      const path = asString(asRecord(part.uri).path);
      return path ? { kind: 'edit', path } : null;
    }
    case 'progressTaskSerialized': {
      const text = plainMessage(asRecord(part.content).value);
      return text ? { kind: 'progress', text } : null;
    }
    case 'questionCarousel': {
      const questions = asArray(part.questions).map((question) =>
        asString(asRecord(question).title)
      );
      const text = questions.filter(Boolean).join('\n') || plainMessage(part.message);
      return { kind: 'question', text, answered: part.isUsed === true };
    }
    case 'confirmation':
      return {
        kind: 'question',
        text: [asString(part.title), plainMessage(part.message)].filter(Boolean).join('\n'),
        answered: part.isUsed === true
      };
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

export function projectRequest(request: JsonRecord): RequestView {
  const state = requestState(request);
  const parts = asArray(request.response)
    .map((part) => projectPart(asRecord(part), state === 'needsInput'))
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

export function projectDetail(
  root: unknown,
  summary: SessionSummary,
  limit: number,
  liveFor: (requestText: string) => LiveEvent[]
): SessionDetail {
  const session = asRecord(root);
  const requests = requestsOf(session);
  const last = requests.at(-1);
  const active = summary.status === 'running' || summary.status === 'needsInput';
  return {
    id: summary.id,
    title: summary.title,
    status: summary.status,
    modelId: summary.modelId,
    modeId: summary.modeId,
    totalRequests: requests.length,
    requests: requests.slice(-limit).map(projectRequest),
    queued: projectQueued(session),
    live: active && last ? liveFor(requestText(last)) : []
  };
}
