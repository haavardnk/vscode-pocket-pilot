import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FlagStore } from '../src/sessions/flagStore';
import { parseSessionFlags } from '../src/sessions/sessionFlags';
import { localSessionPath } from '../src/sessions/sessionUri';

const WAIT = { timeout: 5000 };
const TEST_TIMEOUT_MS = 2 * WAIT.timeout + 5000;

function resource(sessionId: string): string {
  return `vscode-chat-session://local${localSessionPath(sessionId)}`;
}

function writeState(database: string, entries: unknown[]): void {
  const db = new DatabaseSync(database);
  db.exec('CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)');
  db.prepare('INSERT INTO ItemTable (key, value) VALUES (?, ?)').run(
    'agentSessions.state.cache',
    JSON.stringify(entries)
  );
  db.close();
}

describe('parseSessionFlags', () => {
  it('keeps local chat sessions and defaults missing flags', () => {
    const flags = parseSessionFlags(
      JSON.stringify([
        { resource: resource('a-1'), pinned: true, read: 5 },
        { resource: resource('b-2'), archived: true },
        { resource: resource('c-3'), read: 7 },
        { resource: 'copilotcli:/abc', pinned: true },
        { resource: 'vscode-chat-session://local/not%20base64', pinned: true },
        { pinned: true }
      ])
    );
    expect([...flags]).toEqual([
      ['a-1', { pinned: true, archived: false }],
      ['b-2', { pinned: false, archived: true }],
      ['c-3', { pinned: false, archived: false }]
    ]);
  });
});

describe('FlagStore', () => {
  let folder: string;
  let database: string;
  let store: FlagStore;

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'flags-'));
    database = join(folder, 'state.vscdb');
  });

  afterEach(async () => {
    store.dispose();
    vi.useRealTimers();
    await rm(folder, { recursive: true, force: true });
  });

  it(
    'shows an expected change until VS Code stores it, then follows the database',
    async () => {
      writeState(database, [{ resource: resource('s1'), pinned: false }]);
      store = new FlagStore(database, () => undefined);
      await store.start();
      const changed = vi.fn();
      store.onDidChange(changed);

      store.expect('s1', { pinned: true });
      expect(store.flags('s1')).toEqual({ pinned: true, archived: false });

      writeState(database, [{ resource: resource('s1'), pinned: true }]);
      await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(2), WAIT);
      writeState(database, [{ resource: resource('s1'), pinned: false }]);
      await vi.waitFor(
        () => expect(store.flags('s1')).toEqual({ pinned: false, archived: false }),
        WAIT
      );
    },
    TEST_TIMEOUT_MS
  );

  it('drops an expected change that VS Code never stores', async () => {
    vi.useFakeTimers();
    store = new FlagStore(null, () => undefined);
    await store.start();
    store.expect('s1', { archived: true });
    expect(store.flags('s1').archived).toBe(true);
    vi.advanceTimersByTime(120_000);
    expect(store.flags('s1').archived).toBe(false);
  });
});
