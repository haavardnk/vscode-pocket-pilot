import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SessionStore } from '../src/sessions/sessionStore';
import { logLines, request, SESSION_ID, snapshot, transcriptLine } from './fixtures';

describe('SessionStore', () => {
  let folder: string;
  let store: SessionStore;
  let sessions: string;
  let transcripts: string;

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'store-'));
    sessions = join(folder, 'chatSessions');
    transcripts = join(folder, 'transcripts');
    await mkdir(sessions);
    await mkdir(transcripts);
    await writeFile(
      join(sessions, `${SESSION_ID}.jsonl`),
      logLines({ kind: 0, v: snapshot([request('r1', 'Build it', 1)]) })
    );
    await writeFile(join(sessions, 'empty.jsonl'), logLines({ kind: 0, v: snapshot([]) }));
    await writeFile(join(sessions, 'legacy.json'), '{}');
    store = new SessionStore({ sessions, transcripts }, () => undefined);
  });

  afterEach(async () => {
    store.dispose();
    await rm(folder, { recursive: true, force: true });
  });

  it('lists non-empty sessions and follows appended mutations', async () => {
    await store.start();
    expect(store.summaries().map((summary) => [summary.title, summary.status])).toEqual([
      ['Build it', 'idle']
    ]);

    const changed = new Promise<void>((resolve) => {
      store.onDidChange((sessionId) => {
        if (sessionId === null) resolve();
      });
    });
    await appendFile(
      join(sessions, `${SESSION_ID}.jsonl`),
      logLines(
        { kind: 2, k: ['requests'], v: [request('r2', 'Ship it', 0)] },
        { kind: 1, k: ['customTitle'], v: 'Release' }
      )
    );
    await writeFile(
      join(transcripts, `${SESSION_ID}.jsonl`),
      [
        transcriptLine('user.message', { content: 'Ship it' }, 1),
        transcriptLine('tool.execution_start', { toolCallId: 't', toolName: 'build' }, 2)
      ].join('\n') + '\n'
    );
    await changed;

    expect(store.summaries()[0]).toMatchObject({ title: 'Release', status: 'running' });
    const detail = await store.detail(SESSION_ID, 1);
    expect(detail?.requests.map((item) => item.message)).toEqual(['Ship it']);
    expect(detail?.live).toMatchObject([{ kind: 'tool', name: 'build', state: 'running' }]);
  });
});
