import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import {
  clientMessageSchema,
  followerMessageSchema,
  parseMessage,
  pushRegistrationSchema,
  serverMessageSchema,
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
      preview: 'Fix login'
    }
  ],
  agents: [{ id: 'agent', name: 'Agent', description: null, builtin: true }],
  models: []
};

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
});
