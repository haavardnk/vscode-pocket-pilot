import type { HookEvent } from '@pocket-pilot/protocol';

import type { Blob } from '../code/files';
import { matchesRequest } from './transcript';

const MAX_SESSIONS = 8;
const MAX_TURNS = 4;
const MAX_FILES = 50;
const MAX_SNAPSHOTS = 500;
const MAX_TURN_BYTES = 32 * 1024 * 1024;
const SKEW_MS = 2000;

interface Snapshot {
  callId: string;
  path: string;
  before: Blob;
  after: Blob | null;
}

interface LiveTurn {
  at: number;
  prompt: string;
  files: Map<string, Blob>;
  snapshots: Snapshot[];
  bytes: number;
}

export interface RequestWindow {
  message: string;
  timestamp: number;
  until: number | null;
}

export interface LiveSpan {
  files: ReadonlyMap<string, Blob>;
  after(path: string): Promise<Blob>;
}

export interface LiveEdit {
  before: Blob;
  after: Blob;
  final: boolean;
}

function sizeOf(blob: Blob): number {
  return typeof blob === 'string' ? 0 : blob.length;
}

function samePrompt(prompt: string, message: string): boolean {
  return prompt === '' || matchesRequest(message, prompt) || matchesRequest(prompt, message);
}

function sameBlob(a: Blob, b: Blob): boolean {
  return typeof a === 'string' || typeof b === 'string' ? a === b : a.equals(b);
}

export class LiveEdits {
  private readonly sessions = new Map<string, LiveTurn[]>();

  constructor(private readonly current: (path: string) => Promise<Blob>) {}

  async hook(event: HookEvent): Promise<void> {
    if (event.kind === 'prompt') {
      this.begin(event.sessionId, event.at, event.prompt);
      return;
    }
    if (event.kind === 'toolEnd') {
      await this.end(event.sessionId, event.callId);
      return;
    }
    if (event.kind !== 'toolStart' || event.paths.length === 0) return;
    const turn =
      this.sessions.get(event.sessionId)?.at(-1) ?? this.begin(event.sessionId, event.at, '');
    const requested = [...new Set(event.paths)];
    const fresh = requested
      .filter((path) => !turn.files.has(path))
      .slice(0, Math.max(0, MAX_FILES - turn.files.size));
    const paths = requested
      .filter((path) => turn.files.has(path) || fresh.includes(path))
      .slice(0, Math.max(0, MAX_SNAPSHOTS - turn.snapshots.length));
    const blobs = await Promise.all(paths.map((path) => this.current(path)));
    for (const [index, path] of paths.entries()) {
      const before = this.keep(turn, path, blobs[index] ?? 'missing');
      turn.snapshots.push({ callId: event.callId, path, before, after: null });
      if (!turn.files.has(path)) turn.files.set(path, before);
    }
  }

  async edit(sessionId: string, callId: string, path: string): Promise<LiveEdit | null> {
    const snapshots = (this.sessions.get(sessionId) ?? [])
      .flatMap((turn) => turn.snapshots)
      .filter((snapshot) => snapshot.path === path);
    const index = snapshots.findIndex((snapshot) => snapshot.callId === callId);
    const start = snapshots[index];
    if (!start) return null;
    const after = start.after ?? snapshots[index + 1]?.before ?? null;
    if (after !== null) return { before: start.before, after, final: true };
    return { before: start.before, after: await this.current(path), final: false };
  }

  span(sessionId: string, request: RequestWindow): LiveSpan | null {
    const turns = this.sessions.get(sessionId) ?? [];
    const index = turns.findIndex(
      (turn) =>
        turn.at >= request.timestamp - SKEW_MS &&
        (request.until === null || turn.at < request.until - SKEW_MS) &&
        samePrompt(turn.prompt, request.message)
    );
    const turn = turns[index];
    if (!turn) return null;
    const later = turns.slice(index + 1);
    return {
      files: turn.files,
      after: async (path) =>
        later.find((candidate) => candidate.files.has(path))?.files.get(path) ?? this.current(path)
    };
  }

  private async end(sessionId: string, callId: string): Promise<void> {
    const turn = this.sessions
      .get(sessionId)
      ?.findLast((candidate) => candidate.snapshots.some((snapshot) => snapshot.callId === callId));
    if (!turn) return;
    const open = turn.snapshots.filter(
      (snapshot) => snapshot.callId === callId && snapshot.after === null
    );
    const blobs = await Promise.all(open.map((snapshot) => this.current(snapshot.path)));
    for (const [index, snapshot] of open.entries()) {
      snapshot.after = this.keep(turn, snapshot.path, blobs[index] ?? 'missing');
    }
  }

  private keep(turn: LiveTurn, path: string, blob: Blob): Blob {
    const previous = turn.snapshots.findLast((snapshot) => snapshot.path === path);
    const known = previous && (previous.after ?? previous.before);
    if (known && sameBlob(known, blob)) return known;
    if (turn.bytes + sizeOf(blob) > MAX_TURN_BYTES) return 'tooLarge';
    turn.bytes += sizeOf(blob);
    return blob;
  }

  private begin(sessionId: string, at: number, prompt: string): LiveTurn {
    const turns = this.sessions.get(sessionId) ?? [];
    const turn: LiveTurn = { at, prompt, files: new Map(), snapshots: [], bytes: 0 };
    this.sessions.delete(sessionId);
    this.sessions.set(sessionId, [...turns, turn].slice(-MAX_TURNS));
    for (const stale of [...this.sessions.keys()].slice(0, -MAX_SESSIONS)) {
      this.sessions.delete(stale);
    }
    return turn;
  }
}
