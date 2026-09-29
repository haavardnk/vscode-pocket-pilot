import type { RequestState, SessionStatus, SessionSummary } from '@pocket-pilot/protocol';

import { asArray, asNumber, asRecord, asString, type JsonRecord } from '../json';
import { clip } from './partText';

const TITLE_LENGTH = 80;
const PREVIEW_LENGTH = 160;

export type LogSummary = Omit<SessionSummary, 'pinned' | 'archived'>;

export function titleText(text: string): string {
  return clip(text, TITLE_LENGTH) || 'New chat';
}

export function previewText(text: string): string | null {
  return clip(text, PREVIEW_LENGTH) || null;
}

export function requestsOf(root: unknown): JsonRecord[] {
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
