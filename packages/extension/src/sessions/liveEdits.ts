import type { HookEvent } from '@pocket-pilot/protocol';

import type { Blob } from '../code/files';
import { matchesRequest } from './transcript';

const MAX_SESSIONS = 8;
const MAX_TURNS = 4;
const MAX_FILES = 50;
const MAX_TURN_BYTES = 32 * 1024 * 1024;
const SKEW_MS = 2000;

interface LiveTurn {
  at: number;
  prompt: string;
  files: Map<string, Blob>;
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

function sizeOf(blob: Blob): number {
  return typeof blob === 'string' ? 0 : blob.length;
}

function samePrompt(prompt: string, message: string): boolean {
  return prompt === '' || matchesRequest(message, prompt) || matchesRequest(prompt, message);
}

export class LiveEdits {
  private readonly sessions = new Map<string, LiveTurn[]>();

  constructor(private readonly current: (path: string) => Promise<Blob>) {}

  async hook(event: HookEvent): Promise<void> {
    if (event.kind === 'prompt') {
      this.begin(event.sessionId, event.at, event.prompt);
      return;
    }
    if (event.kind !== 'toolStart' || event.paths.length === 0) return;
    const turn =
      this.sessions.get(event.sessionId)?.at(-1) ?? this.begin(event.sessionId, event.at, '');
    const fresh = event.paths
      .filter((path) => !turn.files.has(path))
      .slice(0, Math.max(0, MAX_FILES - turn.files.size));
    const blobs = await Promise.all(fresh.map((path) => this.current(path)));
    for (const [index, path] of fresh.entries()) {
      const blob = blobs[index] ?? 'missing';
      if (turn.files.has(path)) continue;
      const fits = turn.bytes + sizeOf(blob) <= MAX_TURN_BYTES;
      turn.files.set(path, fits ? blob : 'tooLarge');
      if (fits) turn.bytes += sizeOf(blob);
    }
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

  private begin(sessionId: string, at: number, prompt: string): LiveTurn {
    const turns = this.sessions.get(sessionId) ?? [];
    const turn: LiveTurn = { at, prompt, files: new Map(), bytes: 0 };
    this.sessions.delete(sessionId);
    this.sessions.set(sessionId, [...turns, turn].slice(-MAX_TURNS));
    for (const stale of [...this.sessions.keys()].slice(0, -MAX_SESSIONS)) {
      this.sessions.delete(stale);
    }
    return turn;
  }
}
