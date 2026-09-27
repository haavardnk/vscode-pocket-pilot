import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import {
  applyPatch,
  clientMessageSchema,
  diffDetail,
  followerMessageSchema,
  parseMessage,
  pushRegistrationSchema,
  type RequestView,
  type ResponsePart,
  serverMessageSchema,
  type SessionDetail,
  sessionPatchSchema,
  type WindowState
} from '../src';

const window: WindowState = {
  windowId: 'w1',
  name: 'demo',
  repositories: [{ key: 'acme/demo', label: 'acme/demo', github: { owner: 'acme', name: 'demo' } }],
  folders: [{ id: 'f1', name: 'demo' }],
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
  requests,
  queued: []
});

const base = session([turn('r1', [markdown('a')]), turn('r2', [markdown('b'), markdown('c')])]);

const clone = (detail: SessionDetail): SessionDetail =>
  JSON.parse(JSON.stringify(detail)) as SessionDetail;

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
        pullRequests: { status: 'disabled', fetchedAt: null, errors: [], pullRequests: [] }
      }
    ],
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
});
