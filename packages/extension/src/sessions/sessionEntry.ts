import type { PermissionLevel } from '@pocket-pilot/protocol';

import { asArray, asRecord, asString, type JsonRecord } from '../json';
import { LineTailer } from './lineTailer';
import { lastRequestAt, type LogSummary, requestText } from './projection';
import type { QueueOverlay, StartedTurn } from './queue';
import { TranscriptBuffer, type TranscriptTurn } from './transcript';
import { type LogMark, unloggedTurns, withUnlogged } from './unloggedTurns';

interface Exported {
  requests: JsonRecord[];
  at: number;
  summary: LogSummary;
}

export interface Expected<T> {
  value: T;
  at: number;
}

export interface SessionEntry {
  id: string;
  log: LineTailer;
  root: unknown;
  summary: LogSummary | null;
  mark: LogMark;
  transcript: LineTailer | null;
  events: TranscriptBuffer;
  unlogged: TranscriptTurn[];
  reading: Promise<void>;
  requestIds: Set<string>;
  hookedAt: number | null;
  stoppedAt: number | null;
  exported: Exported | null;
  queue: QueueOverlay | null;
  permission: Expected<PermissionLevel> | null;
  mode: Expected<string> | null;
  removed: Expected<string> | null;
}

export function newEntry(id: string, logPath: string): SessionEntry {
  return {
    id,
    log: new LineTailer(logPath),
    root: undefined,
    summary: null,
    mark: { writtenAt: 0, lastRequestAt: null },
    transcript: null,
    events: new TranscriptBuffer(),
    unlogged: [],
    reading: Promise.resolve(),
    requestIds: new Set(),
    hookedAt: null,
    stoppedAt: null,
    exported: null,
    queue: null,
    permission: null,
    mode: null,
    removed: null
  };
}

export function requestsOf(root: unknown): JsonRecord[] {
  return asArray(asRecord(root).requests).map(asRecord);
}

export function rememberRequests(entry: SessionEntry, requests: JsonRecord[]): void {
  for (const request of requests) {
    const id = asString(request.requestId);
    if (id) entry.requestIds.add(id);
  }
}

export function rootOf(entry: SessionEntry): unknown {
  return entry.exported
    ? { ...asRecord(entry.root), requests: entry.exported.requests }
    : entry.root;
}

export function markOf(entry: SessionEntry): LogMark {
  if (!entry.exported) return entry.mark;
  return {
    writtenAt: entry.exported.at,
    lastRequestAt: lastRequestAt({ requests: entry.exported.requests })
  };
}

export function syncUnlogged(entry: SessionEntry): void {
  entry.unlogged = unloggedTurns(entry.events.turns(), markOf(entry));
}

export function startedOf(entry: SessionEntry): StartedTurn[] {
  const logged = new Set(
    requestsOf(entry.root).flatMap((request) => asString(request.requestId) ?? [])
  );
  const exported = (entry.exported?.requests ?? []).flatMap((request) => {
    const id = asString(request.requestId);
    return id && !logged.has(id) ? [{ key: `request:${id}`, text: requestText(request) }] : [];
  });
  return [
    ...exported,
    ...entry.unlogged.map((turn) => ({ key: `turn:${turn.id}`, text: turn.content }))
  ];
}

export function settledOf(entry: SessionEntry): boolean {
  if (entry.stoppedAt === null) return false;
  return entry.stoppedAt > (entry.unlogged.at(-1)?.at ?? markOf(entry).writtenAt);
}

function emptySummary(id: string, at: number): LogSummary {
  return {
    id,
    title: 'New chat',
    createdAt: at,
    updatedAt: at,
    status: 'idle',
    lastRequestState: null,
    modelId: null,
    modeId: null,
    requestCount: 0,
    preview: null
  };
}

export function summaryOf(entry: SessionEntry): LogSummary | null {
  const base =
    entry.exported?.summary ??
    entry.summary ??
    (entry.hookedAt === null ? null : emptySummary(entry.id, entry.hookedAt));
  if (!base) return null;
  const settled = settledOf(entry);
  const logged: LogSummary =
    settled && base.status === 'running'
      ? { ...base, status: 'idle', lastRequestState: 'complete' }
      : base;
  return withUnlogged(logged, entry.unlogged, settled);
}
