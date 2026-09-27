import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { SessionStore } from '../src/sessions/sessionStore';
import { logLines, request, SESSION_ID, snapshot, transcriptLine } from './fixtures';

const live = vi.hoisted((): (() => void)[] => []);

vi.mock('../src/fsWatch', () => ({
  watchTargets: (_targets: unknown, _change: unknown, _error: unknown, onLive: () => void) => {
    live.push(onLive);
    return { close: () => Promise.resolve() };
  }
}));

let folder: string;
let store: SessionStore;

afterEach(async () => {
  store.dispose();
  await rm(folder, { recursive: true, force: true });
});

it('catches up on changes the watcher missed while starting', async () => {
  folder = await mkdtemp(join(tmpdir(), 'reconcile-'));
  const sessions = join(folder, 'chatSessions');
  const transcripts = join(folder, 'transcripts');
  await mkdir(sessions);
  await mkdir(transcripts);
  await writeFile(
    join(sessions, `${SESSION_ID}.jsonl`),
    logLines({ kind: 0, v: snapshot([request('r1', 'Build it', 1)]) })
  );
  await writeFile(
    join(sessions, 'gone.jsonl'),
    logLines({ kind: 0, v: snapshot([request('g1', 'Old chat', 1)]) })
  );
  store = new SessionStore({ sessions, transcripts }, () => undefined);
  await store.start();
  expect(store.summaries().map((summary) => summary.id)).toHaveLength(2);

  await appendFile(
    join(sessions, `${SESSION_ID}.jsonl`),
    logLines(
      { kind: 2, k: ['requests'], v: [request('r2', 'Ship it', 0)] },
      { kind: 1, k: ['customTitle'], v: 'Release' }
    )
  );
  await rm(join(sessions, 'gone.jsonl'));
  const later = Date.now() + 60_000;
  await writeFile(
    join(transcripts, `${SESSION_ID}.jsonl`),
    [
      transcriptLine('user.message', { content: 'Ship it' }, 1, later),
      transcriptLine('tool.execution_start', { toolCallId: 't', toolName: 'build' }, 2, later)
    ].join('\n') + '\n'
  );
  for (const onLive of live) onLive();

  await vi.waitFor(() =>
    expect(store.summaries().map(({ id, title, status }) => ({ id, title, status }))).toEqual([
      { id: SESSION_ID, title: 'Release', status: 'running' }
    ])
  );
});
