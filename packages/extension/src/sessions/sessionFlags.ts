import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { z } from 'zod';

import { localSessionId } from './sessionUri';

const STATE_KEY = 'agentSessions.state.cache';
const BUSY_TIMEOUT_MS = 200;

const stateEntrySchema = z.object({
  resource: z.string(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional()
});

export interface SessionFlags {
  pinned: boolean;
  archived: boolean;
}

export function parseSessionFlags(raw: string): Map<string, SessionFlags> {
  const entries = z.array(z.unknown()).parse(JSON.parse(raw));
  return new Map(
    entries.flatMap((entry): [string, SessionFlags][] => {
      const parsed = stateEntrySchema.safeParse(entry);
      if (!parsed.success) return [];
      const sessionId = localSessionId(parsed.data.resource);
      if (sessionId === null) return [];
      return [
        [
          sessionId,
          { pinned: parsed.data.pinned ?? false, archived: parsed.data.archived ?? false }
        ]
      ];
    })
  );
}

export function readSessionFlags(database: string): Map<string, SessionFlags> {
  if (!existsSync(database)) return new Map();
  const db = new DatabaseSync(database, { readOnly: true, timeout: BUSY_TIMEOUT_MS });
  try {
    const row = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get(STATE_KEY);
    return typeof row?.value === 'string' ? parseSessionFlags(row.value) : new Map();
  } finally {
    db.close();
  }
}
