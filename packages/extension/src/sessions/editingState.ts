import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { EditState } from '@pocket-pilot/protocol';
import { z } from 'zod';

import { type Blob, MAX_FILE_BYTES } from '../code/files';
import { parseJson } from '../json';

export const EMPTY_HASH = 'da39a3e';
const STATES: readonly EditState[] = ['pending', 'kept', 'undone'];

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

function filePath(resource: string): string | null {
  try {
    const url = new URL(resource);
    return url.protocol === 'file:' ? fileURLToPath(url) : null;
  } catch {
    return null;
  }
}

export class EditingSessions {
  constructor(private readonly root: string | null) {}

  async entries(sessionId: string): Promise<EditingEntry[]> {
    if (this.root === null) return [];
    const raw = await readFile(join(this.root, sessionId, 'state.json'), 'utf8').catch(() => null);
    if (raw === null) return [];
    const parsed = stateSchema.safeParse(parseJson(raw));
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

  async blob(sessionId: string, hash: string): Promise<Blob> {
    if (this.root === null || !hashSchema.safeParse(hash).success) return 'missing';
    const file = join(this.root, sessionId, 'contents', hash);
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) return 'missing';
    if (info.size > MAX_FILE_BYTES) return 'tooLarge';
    return readFile(file);
  }
}
