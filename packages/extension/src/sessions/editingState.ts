import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { EditState } from '@pocket-pilot/protocol';
import { z } from 'zod';

import { type Blob, MAX_FILE_BYTES } from '../code/files';
import { parseJson } from '../json';
import { parseTimeline, type Timeline } from './timeline';

export const EMPTY_HASH = 'da39a3e';
const STATES: readonly EditState[] = ['pending', 'kept', 'undone'];
const MAX_CACHED = 8;

const hashSchema = z.string().regex(/^[0-9a-f]{7}$/);

const entrySchema = z.object({
  resource: z.string(),
  originalHash: hashSchema,
  currentHash: hashSchema,
  state: z.number().int().min(0).max(2),
  isDeleted: z.boolean().optional()
});

const stateSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  initialFileContents: z.array(z.tuple([z.string(), hashSchema])),
  recentSnapshot: z.object({ entries: z.array(entrySchema) })
});

export interface EditingEntry {
  path: string;
  state: EditState;
  baselineHash: string;
  deleted: boolean;
}

interface CachedState {
  mtime: number;
  size: number;
  value: unknown;
  timeline: Timeline | null;
}

function filePath(resource: string): string | null {
  try {
    const url = new URL(resource);
    return url.protocol === 'file:' ? fileURLToPath(url) : null;
  } catch {
    return null;
  }
}

export class EditingSessions {
  private readonly cache = new Map<string, CachedState>();

  constructor(private readonly root: string | null) {}

  async entries(sessionId: string): Promise<EditingEntry[]> {
    const parsed = stateSchema.safeParse(await this.state(sessionId));
    if (!parsed.success) return [];
    const initial = new Map(
      parsed.data.initialFileContents.map(([resource, hash]) => [resource, hash])
    );
    return parsed.data.recentSnapshot.entries.flatMap((entry) => {
      const path = filePath(entry.resource);
      const state = STATES[entry.state] ?? 'pending';
      if (path === null) return [];
      return [
        {
          path,
          state,
          baselineHash:
            state === 'pending'
              ? entry.originalHash
              : (initial.get(entry.resource) ?? entry.originalHash),
          deleted: entry.isDeleted === true
        }
      ];
    });
  }

  async timeline(sessionId: string): Promise<Timeline> {
    const entry = await this.load(sessionId);
    if (!entry) return parseTimeline(undefined);
    entry.timeline ??= parseTimeline(entry.value);
    return entry.timeline;
  }

  async savedAt(sessionId: string): Promise<number | null> {
    return (await this.load(sessionId))?.mtime ?? null;
  }

  async blob(sessionId: string, hash: string): Promise<Blob> {
    if (this.root === null || !hashSchema.safeParse(hash).success) return 'missing';
    const file = join(this.root, sessionId, 'contents', hash);
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) return 'missing';
    if (info.size > MAX_FILE_BYTES) return 'tooLarge';
    return readFile(file);
  }

  private async state(sessionId: string): Promise<unknown> {
    return (await this.load(sessionId))?.value;
  }

  private async load(sessionId: string): Promise<CachedState | null> {
    if (this.root === null) return null;
    const file = join(this.root, sessionId, 'state.json');
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) return null;
    const cached = this.cache.get(sessionId);
    if (cached?.mtime === info.mtimeMs && cached.size === info.size) return cached;
    const raw = await readFile(file, 'utf8').catch(() => null);
    const entry: CachedState = {
      mtime: info.mtimeMs,
      size: info.size,
      value: raw === null ? undefined : parseJson(raw),
      timeline: null
    };
    this.cache.delete(sessionId);
    this.cache.set(sessionId, entry);
    for (const stale of [...this.cache.keys()].slice(0, -MAX_CACHED)) this.cache.delete(stale);
    return entry;
  }
}
