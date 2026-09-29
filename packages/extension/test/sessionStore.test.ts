import { appendFile, mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { HookEvent, QueuedRequest, SessionDetail } from '@pocket-pilot/protocol';
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

  it.each([
    {
      name: 'permission',
      expect: (): void => store.expectPermission(SESSION_ID, 'autopilot'),
      read: (detail: SessionDetail | null) => detail?.permission,
      phone: 'autopilot',
      mutation: { kind: 1, k: ['inputState', 'permissionLevel'], v: 'autoApprove' },
      logged: 'autoApprove'
    },
    {
      name: 'mode',
      expect: (): void => store.expectMode(SESSION_ID, 'agent'),
      read: (detail: SessionDetail | null) => detail?.modeId,
      phone: 'agent',
      mutation: { kind: 1, k: ['inputState', 'mode'], v: { id: 'ask', kind: 'agent' } },
      logged: 'ask'
    },
    {
      name: 'model',
      expect: (): void => store.expectModel(SESSION_ID, 'copilot/claude-opus-4.5'),
      read: (detail: SessionDetail | null) => detail?.modelId,
      phone: 'copilot/claude-opus-4.5',
      mutation: {
        kind: 1,
        k: ['inputState', 'selectedModel'],
        v: { identifier: 'copilot/gpt-5-mini' }
      },
      logged: 'copilot/gpt-5-mini'
    }
  ])('holds a phone $name change until the log is written', async (change) => {
    await store.start();
    const current = async (): Promise<string | null | undefined> =>
      change.read(await store.detail(SESSION_ID, 1));

    change.expect();
    expect(await current()).toBe(change.phone);

    const logged = new Promise<void>((resolve) => {
      store.onDidChange((sessionId) => {
        if (sessionId === SESSION_ID) resolve();
      });
    });
    await appendFile(join(sessions, `${SESSION_ID}.jsonl`), logLines(change.mutation));
    await logged;
    expect(await current()).toBe(change.logged);
  });

  it('hides removed requests until the log is written', async () => {
    const log = join(sessions, `${SESSION_ID}.jsonl`);
    await appendFile(log, logLines({ kind: 2, k: ['requests'], v: [request('r2', 'Ship it', 1)] }));
    await store.start();
    const messages = async (): Promise<string[] | undefined> =>
      (await store.detail(SESSION_ID, 10))?.requests.map((item) => item.message);

    store.expectRemoved(SESSION_ID, 'missing');
    expect(await messages()).toEqual(['Build it', 'Ship it']);
    store.expectRemoved(SESSION_ID, 'r2');
    expect(await messages()).toEqual(['Build it']);

    const logged = new Promise<void>((resolve) => {
      store.onDidChange((sessionId) => {
        if (sessionId === SESSION_ID) resolve();
      });
    });
    await appendFile(log, logLines({ kind: 1, k: ['customTitle'], v: 'Release' }));
    await logged;
    expect(await messages()).toEqual(['Build it', 'Ship it']);
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
    const later = Date.now() + 60_000;
    await writeFile(
      join(transcripts, `${SESSION_ID}.jsonl`),
      [
        transcriptLine('user.message', { content: 'Ship it' }, 1, later),
        transcriptLine('tool.execution_start', { toolCallId: 't', toolName: 'build' }, 2, later)
      ].join('\n') + '\n'
    );
    await changed;

    expect(store.summaries()[0]).toMatchObject({ title: 'Release', status: 'running' });
    const detail = await store.detail(SESSION_ID, 1);
    expect(detail?.requests.map((item) => item.message)).toEqual(['Ship it']);
    expect(detail?.requests[0]?.parts).toMatchObject([
      { kind: 'tool', toolId: 'build', status: 'running' }
    ]);
  });

  it('shows transcript turns until VS Code saves them to the log', async () => {
    const log = join(sessions, `${SESSION_ID}.jsonl`);
    const saved = new Date(Date.UTC(2026, 0, 1, 0, 0, 20));
    await utimes(log, saved, saved);
    await store.start();

    const listed = nextListChange(store);
    await writeFile(
      join(transcripts, `${SESSION_ID}.jsonl`),
      [
        transcriptLine('user.message', { content: 'Build it' }, 1),
        transcriptLine('user.message', { content: 'From phone' }, 30),
        transcriptLine('tool.execution_start', { toolCallId: 't', toolName: 'grep' }, 31)
      ].join('\n') + '\n'
    );
    await listed;
    expect(store.summaries()[0]).toMatchObject({
      status: 'running',
      requestCount: 2,
      preview: 'From phone'
    });
    const pending = await store.detail(SESSION_ID, 10);
    expect(pending?.requests.map((item) => [item.message, item.state])).toEqual([
      ['Build it', 'complete'],
      ['From phone', 'pending']
    ]);
    expect(pending?.requests.at(-1)?.parts).toMatchObject([
      { kind: 'tool', toolId: 'grep', status: 'running' }
    ]);

    const logged = nextListChange(store);
    await appendFile(
      log,
      logLines({ kind: 2, k: ['requests'], v: [request('r2', 'From phone', 1)] })
    );
    await logged;
    expect(store.summaries()[0]).toMatchObject({ status: 'idle', requestCount: 2 });
    const detail = await store.detail(SESSION_ID, 10);
    expect(detail?.requests.map((item) => item.id)).toEqual(['r1', 'r2']);
    expect(detail?.requests.at(-1)?.parts).toEqual([]);
  });

  it('follows a chat through hooks before VS Code writes any log', async () => {
    await store.start();
    const at = Date.now();
    const hooks: HookEvent[] = [
      { kind: 'prompt', sessionId: 'fresh', at, prompt: 'Write the parser' },
      {
        kind: 'toolStart',
        sessionId: 'fresh',
        at: at + 1,
        callId: 'c',
        toolName: 'grep',
        paths: [],
        command: null
      }
    ];
    for (const event of hooks) await store.hook(event);
    expect(store.summaries()[0]).toMatchObject({
      id: 'fresh',
      title: 'Write the parser',
      status: 'running',
      requestCount: 1
    });
    const running = await store.detail('fresh', 10);
    expect(running?.requests.map((item) => [item.message, item.state, item.parts])).toEqual([
      [
        'Write the parser',
        'pending',
        [
          {
            kind: 'tool',
            callId: 'c',
            toolId: 'grep',
            message: 'grep',
            detail: null,
            title: null,
            grouped: true,
            awaitingConfirmation: false,
            status: 'running',
            terminal: null,
            subagent: null,
            parentCallId: null
          }
        ]
      ]
    ]);

    await store.hook({ kind: 'stop', sessionId: 'fresh', at: at + 2 });
    expect(store.summaries()[0]).toMatchObject({ id: 'fresh', status: 'idle' });
    const stopped = await store.detail('fresh', 10);
    expect(stopped?.requests[0]).toMatchObject({
      state: 'complete',
      parts: [{ kind: 'tool', status: 'done' }]
    });
  });

  it('merges a live export into the session that owns its requests', async () => {
    await store.start();
    const at = Date.now() + 1000;
    const live = {
      ...request('r9', 'Live now', 2, [{ value: 'Streaming the answer' }]),
      modelState: { value: 2, completedAt: at + 5 }
    };
    store.applyExport({ requests: [request('r1', 'Build it', 1), live] }, at);
    expect(store.summaries()[0]).toMatchObject({
      id: SESSION_ID,
      title: 'Build it',
      status: 'running',
      requestCount: 2,
      preview: 'Live now'
    });
    const detail = await store.detail(SESSION_ID, 10);
    expect(detail?.requests.map((item) => [item.id, item.state, item.parts])).toEqual([
      ['r1', 'complete', []],
      ['r9', 'pending', [{ kind: 'markdown', text: 'Streaming the answer' }]]
    ]);

    store.applyExport({ requests: [request('r1', 'Build it', 1), live] }, at + 10);
    expect(store.summaries()[0]).toMatchObject({ status: 'idle', lastRequestState: 'cancelled' });
    expect((await store.detail(SESSION_ID, 10))?.requests.at(-1)?.state).toBe('cancelled');

    store.applyExport({ requests: [request('x1', 'Unknown chat', 0)] }, Date.now() + 1000);
    expect(store.summaries().map((summary) => summary.id)).toEqual([SESSION_ID]);
  });

  it('keeps a logged wait for input over a live export', async () => {
    await writeFile(
      join(sessions, `${SESSION_ID}.jsonl`),
      logLines({
        kind: 0,
        v: snapshot([request('r1', 'Build it', 1), request('r2', 'Run tests', 4)])
      })
    );
    await store.start();
    const at = Date.now() + 1000;
    const tool = {
      kind: 'toolInvocationSerialized',
      toolCallId: 'c1',
      toolId: 'run_in_terminal',
      invocationMessage: 'Run tests',
      isComplete: true
    };
    const live = {
      ...request('r2', 'Run tests', 2, [tool]),
      modelState: { value: 2, completedAt: at + 5 }
    };
    store.applyExport({ requests: [request('r1', 'Build it', 1), live] }, at);
    expect(store.summaries()[0]).toMatchObject({ status: 'needsInput' });
    const detail = await store.detail(SESSION_ID, 10);
    expect(detail?.requests.at(-1)).toMatchObject({
      state: 'needsInput',
      parts: [{ kind: 'tool', callId: 'c1', awaitingConfirmation: true }]
    });
  });

  it('waits for open questions in a live export before the log saves them', async () => {
    await store.start();
    const at = Date.now() + 1000;
    const carousel = {
      kind: 'questionCarousel',
      resolveId: 'q1',
      questions: [
        {
          id: 'q1:0',
          type: 'singleSelect',
          title: 'Channel',
          options: [{ id: 'Stable', label: 'Stable', value: 'Stable' }]
        }
      ]
    };
    const live = {
      ...request('r2', 'Plan it', 2, [carousel]),
      modelState: { value: 2, completedAt: at + 5 }
    };
    store.applyExport({ requests: [request('r1', 'Build it', 1), live] }, at);
    expect(store.summaries()[0]).toMatchObject({ status: 'needsInput' });
    const detail = await store.detail(SESSION_ID, 10);
    expect(detail?.requests.at(-1)).toMatchObject({
      state: 'needsInput',
      parts: [{ kind: 'questions', resolveId: 'q1', state: 'pending' }]
    });
  });

  it('resumes once a live export shows the logged questions answered', async () => {
    const carousel = { kind: 'questionCarousel', resolveId: 'q1', questions: [] };
    await writeFile(
      join(sessions, `${SESSION_ID}.jsonl`),
      logLines({
        kind: 0,
        v: snapshot([request('r1', 'Build it', 1), request('r2', 'Plan it', 4, [carousel])])
      })
    );
    await store.start();
    const at = Date.now() + 1000;
    const live = {
      ...request('r2', 'Plan it', 2, [
        { ...carousel, isUsed: true, data: {} },
        { value: 'Planning the waves' }
      ]),
      modelState: { value: 2, completedAt: at + 5 }
    };
    store.applyExport({ requests: [request('r1', 'Build it', 1), live] }, at);
    expect(store.summaries()[0]).toMatchObject({ status: 'running' });
    expect((await store.detail(SESSION_ID, 10))?.requests.at(-1)?.state).toBe('pending');
  });

  it('holds a phone queue change until the log catches up', async () => {
    await store.start();
    const queued = (id: string, text: string): QueuedRequest => ({
      id,
      delivery: 'queued',
      text,
      attachments: 0
    });
    const ids = async (): Promise<string[] | undefined> =>
      (await store.detail(SESSION_ID, 10))?.queued.map((item) => item.id);

    const at = Date.now();
    await store.hook({ kind: 'prompt', sessionId: SESSION_ID, at, prompt: 'Build it' });
    store.expectQueue(SESSION_ID, [queued('phone:1', 'Next'), queued('phone:2', 'Later')]);
    expect(await ids()).toEqual(['phone:1', 'phone:2']);

    await store.hook({ kind: 'prompt', sessionId: SESSION_ID, at: at + 1000, prompt: 'Next' });
    expect(await ids()).toEqual(['phone:2']);

    const logged = new Promise<void>((resolve) => {
      store.onDidChange((sessionId) => {
        if (sessionId === SESSION_ID) resolve();
      });
    });
    await appendFile(
      join(sessions, `${SESSION_ID}.jsonl`),
      logLines({
        kind: 1,
        k: ['pendingRequests'],
        v: [{ id: 'q2', kind: 'queued', request: { message: { text: 'Later' } } }]
      })
    );
    await logged;
    expect(await ids()).toEqual(['q2']);
  });
});

function nextListChange(target: SessionStore): Promise<void> {
  return new Promise((resolve) => {
    const stop = target.onDidChange((sessionId) => {
      if (sessionId !== null) return;
      stop();
      resolve();
    });
  });
}
