import { z } from 'zod';

import { codeQuerySchema, codeResultSchema } from './code';
import { commandSchema, sessionWatchSchema } from './commands';
import { pullRequestStateSchema, sessionDetailSchema, windowStateSchema } from './domain';

const queryResult = {
  type: z.literal('queryResult'),
  requestId: z.string(),
  result: codeResultSchema.nullable(),
  error: z.string().nullable()
};

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('subscribe'),
    windowId: z.string(),
    sessionId: z.string(),
    limit: z.number().int().min(1).max(500)
  }),
  z.object({ type: z.literal('unsubscribe') }),
  z.object({ type: z.literal('command'), requestId: z.string(), command: commandSchema }),
  z.object({ type: z.literal('query'), requestId: z.string(), query: codeQuerySchema }),
  z.object({ type: z.literal('refreshPullRequests') })
]);

export const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('snapshot'),
    version: z.string(),
    windows: z.array(windowStateSchema),
    pullRequests: pullRequestStateSchema
  }),
  z.object({ type: z.literal('window'), window: windowStateSchema }),
  z.object({ type: z.literal('windowRemoved'), windowId: z.string() }),
  z.object({
    type: z.literal('session'),
    windowId: z.string(),
    sessionId: z.string(),
    detail: sessionDetailSchema.nullable()
  }),
  z.object({ type: z.literal('pullRequests'), state: pullRequestStateSchema }),
  z.object({
    type: z.literal('result'),
    requestId: z.string(),
    ok: z.boolean(),
    error: z.string().nullable()
  }),
  z.object(queryResult)
]);

export const followerMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('register'), secret: z.string(), window: windowStateSchema }),
  z.object({ type: z.literal('window'), window: windowStateSchema }),
  z.object({
    type: z.literal('session'),
    sessionId: z.string(),
    detail: sessionDetailSchema.nullable()
  }),
  z.object({
    type: z.literal('result'),
    requestId: z.string(),
    ok: z.boolean(),
    error: z.string().nullable()
  }),
  z.object(queryResult)
]);

export const leaderMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('watch'), sessions: z.array(sessionWatchSchema) }),
  z.object({ type: z.literal('command'), requestId: z.string(), command: commandSchema }),
  z.object({ type: z.literal('query'), requestId: z.string(), query: codeQuerySchema })
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;
export type FollowerMessage = z.infer<typeof followerMessageSchema>;
export type LeaderMessage = z.infer<typeof leaderMessageSchema>;

export function parseMessage<T>(schema: z.ZodType<T>, raw: string): T | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = schema.safeParse(json);
  return result.success ? result.data : null;
}
