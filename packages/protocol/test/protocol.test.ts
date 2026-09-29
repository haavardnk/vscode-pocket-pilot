import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import {
  applyPatch,
  applyTerminalPatch,
  clientMessageSchema,
  diffDetail,
  type ExecutionPatch,
  followerMessageSchema,
  mismatchReply,
  parseMessage,
  pushRegistrationSchema,
  type RequestView,
  type ResponsePart,
  serverMessageSchema,
  type SessionDetail,
  sessionPatchSchema,
  type TerminalDetail,
  type TerminalExecution,
  type TerminalLine,
  VERSION_MISMATCH,
  type WindowState
} from '../src';

const window: WindowState = {
  windowId: 'w1',
  name: 'demo',
  workspace: 'file:///demo',
  repositories: [{ key: 'acme/demo', label: 'acme/demo', github: { owner: 'acme', name: 'demo' } }],
  folders: [
    {
      id: 'f1',
      name: 'demo',
      repositoryKey: 'acme/demo',
      git: {
        branch: 'main',
        commit: 'abc1234',
        upstream: { remote: 'origin', branch: 'main', ahead: 1, behind: 0 },
        changed: 2
      }
    }
  ],
  sessions: [
    {
      id: 's1',
      title: 'Fix login',
      createdAt: 1,
      updatedAt: 2,
      status: 'running',
      lastRequestState: 'pending',
      modelId: 'copilot/gpt-5',
      modeId: 'agent',
      requestCount: 1,
      preview: 'Fix login',
      pinned: true,
      archived: false
    }
  ],
  terminals: [],
  canOrganize: true,
  agents: [{ id: 'agent', name: 'Agent', description: null, builtin: true }],
  models: []
};

const markdown = (text: string): ResponsePart => ({ kind: 'markdown', text });

const turn = (id: string, parts: ResponsePart[]): RequestView => ({
  id,
  timestamp: 1,
  message: id,
  modelId: null,
  state: 'pending',
  error: null,
  parts
});

const session = (requests: RequestView[], title = 'Demo'): SessionDetail => ({
  id: 's1',
  title,
  status: 'running',
  modelId: null,
  modeId: null,
  permission: 'default',
  totalRequests: requests.length,
  editedFiles: 0,
  todos: null,
  requests,
  queued: []
});

const base = session([turn('r1', [markdown('a')]), turn('r2', [markdown('b'), markdown('c')])]);

const clone = (detail: SessionDetail): SessionDetail =>
  JSON.parse(JSON.stringify(detail)) as SessionDetail;

const line = (text: string): TerminalLine => [{ text, fg: null, bg: null, flags: 0 }];

const meta = (id: string): Omit<TerminalExecution, 'lines'> => ({
  id,
  command: 'npm test',
  cwd: null,
  startedAt: 1,
  endedAt: null,
  exitCode: null,
  sessionId: null,
  callId: null,
  alternate: false,
  dropped: 0,
  tail: []
});

const execution = (
  id: string,
  lines: string[],
  fields: Partial<TerminalExecution> = {}
): TerminalExecution => ({ ...meta(id), lines: lines.map(line), ...fields });

const update = (
  id: string,
  append: string[],
  fields: Partial<ExecutionPatch> = {}
): ExecutionPatch => ({ ...meta(id), append: append.map(line), ...fields });

const terminal = (): TerminalDetail => ({
  id: 't1',
  dropped: 0,
  executions: [execution('e1', ['a', 'b']), execution('e2', ['c'])],
  stream: null
});

describe('protocol', () => {
  it.each<[z.ZodType, unknown]>([
    [clientMessageSchema, { type: 'subscribe', windowId: 'w1', sessionId: 's1', limit: 20 }],
    [
      clientMessageSchema,
      {
        type: 'command',
        requestId: 'r1',
        command: { kind: 'send', windowId: 'w1', sessionId: 's1', text: 'go', delivery: 'steering' }
      }
    ],
    [
      serverMessageSchema,
      {
        type: 'snapshot',
        version: '0.1.0',
        windows: [window],
        incompatibleWindows: ['old'],
        usage: null
      }
    ],
    [
      serverMessageSchema,
      {
        type: 'usage',
        usage: {
          state: 'ready',
          plan: 'Pro+',
          meters: [
            { kind: 'premium', usedPercent: 42, used: 630, total: 1500, unlimited: false },
            { kind: 'chat', usedPercent: 0, used: null, total: null, unlimited: true }
          ],
          overage: { permitted: true, count: 0 },
          resetAt: 1_759_276_800_000,
          checkedAt: 1_758_000_000_000
        }
      }
    ],
    [serverMessageSchema, { type: 'usage', usage: { state: 'needsAccess' } }],
    [followerMessageSchema, { type: 'register', secret: 'x', window }],
    [
      clientMessageSchema,
      {
        type: 'query',
        requestId: 'q',
        query: { kind: 'gitDiff', windowId: 'w1', folderId: 'f1', path: 'a.ts' }
      }
    ],
    [
      serverMessageSchema,
      {
        type: 'queryResult',
        requestId: 'q',
        result: {
          kind: 'gitDiff',
          language: 'typescript',
          file: {
            path: 'a.ts',
            previousPath: null,
            change: 'modified',
            additions: 1,
            deletions: 1
          },
          diff: { kind: 'text', hunks: [{ oldStart: 1, newStart: 1, lines: ['-a', '+b'] }] }
        },
        error: null
      }
    ]
  ])('round trips %#', (schema, message) => {
    expect(parseMessage(schema, JSON.stringify(message))).toEqual(message);
  });

  it.each([
    'not json',
    JSON.stringify({ type: 'command', requestId: 'r', command: { kind: 'send', text: '' } }),
    JSON.stringify({ type: 'unknown' })
  ])('rejects %s', (raw) => {
    expect(parseMessage(clientMessageSchema, raw)).toBeNull();
  });

  it.each([
    [
      { type: 'query', requestId: 'q', query: { kind: 'hologram' } },
      { type: 'queryResult', requestId: 'q', result: null, error: VERSION_MISMATCH }
    ],
    [
      { type: 'command', requestId: 'c', command: { kind: 'teleport' } },
      { type: 'result', requestId: 'c', ok: false, error: VERSION_MISMATCH }
    ],
    [{ type: 'presence', visible: 'yes' }, null]
  ])('answers unreadable request %#', (message, reply) => {
    expect(mismatchReply(JSON.stringify(message))).toEqual(reply);
  });

  it.each([
    ['https://fcm.googleapis.com/fcm/send/abc', true],
    ['http://fcm.googleapis.com/fcm/send/abc', false],
    ['not a url', false]
  ])('accepts push endpoint %s: %s', (endpoint, valid) => {
    const registration = {
      subscription: { endpoint, keys: { p256dh: 'p', auth: 'a' } },
      events: null
    };
    expect(pushRegistrationSchema.safeParse(registration).success).toBe(valid);
  });

  it.each([
    [
      'streamed text',
      session([turn('r1', [markdown('a')]), turn('r2', [markdown('b'), markdown('cd')])]),
      1,
      1
    ],
    ['new request', session([...base.requests, turn('r3', [])]), 2, 0],
    ['replaced request', session([turn('r1', [markdown('a')]), turn('r9', [markdown('b')])]), 1, 0],
    ['trimmed window', session([turn('r2', [markdown('b'), markdown('c')])]), 0, 0],
    ['title only', session(base.requests, 'Renamed'), 2, null]
  ])('patches %s', (_, next, requestsFrom, partsFrom) => {
    const patch = diffDetail(base, next);
    expect(patch && sessionPatchSchema.parse(patch)).toEqual(patch);
    expect([patch?.requestsFrom, patch?.requests[0]?.partsFrom ?? null]).toEqual([
      requestsFrom,
      partsFrom
    ]);
    const current = clone(base);
    const first = current.requests[0];
    if (patch) applyPatch(current, patch);
    expect(current).toEqual(next);
    expect(current.requests[0] === first).toBe(requestsFrom > 0);
  });

  it('skips unchanged sessions', () => {
    expect(diffDetail(base, clone(base))).toBeNull();
  });

  it.each<[string, Parameters<typeof applyTerminalPatch>[1], TerminalExecution[]]>([
    [
      'appended output',
      { dropped: 0, executions: [update('e2', ['d'], { tail: [line('%')] })], stream: null },
      [execution('e1', ['a', 'b']), execution('e2', ['c', 'd'], { tail: [line('%')] })]
    ],
    [
      'dropped lines',
      { dropped: 0, executions: [update('e1', ['x'], { dropped: 2 })], stream: null },
      [execution('e1', ['x'], { dropped: 2 }), execution('e2', ['c'])]
    ],
    [
      'lines dropped past the old end',
      { dropped: 0, executions: [update('e2', ['z'], { dropped: 4 })], stream: null },
      [execution('e1', ['a', 'b']), execution('e2', ['z'], { dropped: 4 })]
    ],
    [
      'new execution with dropped history',
      { dropped: 1, executions: [update('e3', ['e'], { exitCode: 0 })], stream: null },
      [execution('e2', ['c']), execution('e3', ['e'], { exitCode: 0 })]
    ]
  ])('patches terminal %s', (_, patch, executions) => {
    const current = terminal();
    applyTerminalPatch(current, patch);
    expect(current.executions).toEqual(executions);
    expect(current.dropped).toBe(patch.dropped);
  });

  it('patches a terminal stream', () => {
    const current = terminal();
    const stream = (dropped: number, append: string[], tail: string[]) => ({
      dropped,
      append: append.map(line),
      tail: tail.map(line),
      alternate: false
    });
    applyTerminalPatch(current, { dropped: 0, executions: [], stream: stream(0, ['a'], ['$']) });
    applyTerminalPatch(current, { dropped: 0, executions: [], stream: null });
    applyTerminalPatch(current, { dropped: 0, executions: [], stream: stream(2, ['c'], ['%']) });
    expect(current.stream).toEqual({
      dropped: 2,
      lines: [line('c')],
      tail: [line('%')],
      alternate: false
    });
    expect(current.executions).toEqual(terminal().executions);
  });
});
