import { z } from 'zod';

import { codeQuerySchema, codeResultSchema } from './code.ts';
import { commandSchema, sessionWatchSchema } from './commands.ts';
import { pullRequestStateSchema, sessionDetailSchema, windowStateSchema } from './domain.ts';
import { sessionPatchSchema } from './patch.ts';
import { terminalDetailSchema, terminalPatchSchema } from './terminal.ts';

const hookTarget = { sessionId: z.string(), at: z.number() };

export const hookEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('prompt'), ...hookTarget, prompt: z.string() }),
  z.object({
    kind: z.literal('toolStart'),
    ...hookTarget,
    callId: z.string(),
    toolName: z.string(),
    paths: z.array(z.string()),
    command: z.string().nullable()
  }),
  z.object({ kind: z.literal('toolEnd'), ...hookTarget, callId: z.string() }),
  z.object({ kind: z.literal('stop'), ...hookTarget })
]);

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
  z.object({ type: z.literal('watchTerminal'), windowId: z.string(), terminalId: z.string() }),
  z.object({ type: z.literal('unwatchTerminal') }),
  z.object({ type: z.literal('command'), requestId: z.string(), command: commandSchema }),
  z.object({ type: z.literal('query'), requestId: z.string(), query: codeQuerySchema }),
  z.object({ type: z.literal('refreshPullRequests') }),
  z.object({ type: z.literal('presence'), visible: z.boolean() })
]);

export const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('snapshot'),
    version: z.string(),
    windows: z.array(windowStateSchema),
    incompatibleWindows: z.array(z.string()),
    pullRequests: pullRequestStateSchema
  }),
  z.object({ type: z.literal('window'), window: windowStateSchema }),
  z.object({ type: z.literal('windowRemoved'), windowId: z.string() }),
  z.object({ type: z.literal('incompatibleWindows'), names: z.array(z.string()) }),
  z.object({
    type: z.literal('session'),
    windowId: z.string(),
    sessionId: z.string(),
    detail: sessionDetailSchema.nullable()
  }),
  z.object({
    type: z.literal('sessionPatch'),
    windowId: z.string(),
    sessionId: z.string(),
    patch: sessionPatchSchema
  }),
  z.object({
    type: z.literal('terminal'),
    windowId: z.string(),
    terminalId: z.string(),
    detail: terminalDetailSchema.nullable()
  }),
  z.object({
    type: z.literal('terminalPatch'),
    windowId: z.string(),
    terminalId: z.string(),
    patch: terminalPatchSchema
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
    type: z.literal('terminal'),
    terminalId: z.string(),
    detail: terminalDetailSchema.nullable()
  }),
  z.object({
    type: z.literal('terminalPatch'),
    terminalId: z.string(),
    patch: terminalPatchSchema
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
  z.object({ type: z.literal('watchTerminals'), terminalIds: z.array(z.string()) }),
  z.object({ type: z.literal('command'), requestId: z.string(), command: commandSchema }),
  z.object({ type: z.literal('query'), requestId: z.string(), query: codeQuerySchema }),
  z.object({ type: z.literal('hook'), requestId: z.string(), event: hookEventSchema })
]);

export const VERSION_MISMATCH =
  "Pocket Pilot versions don't match. Reload every VS Code window, then reload this app.";

export const stableRequestSchema = z.object({ type: z.string(), requestId: z.string() });

export const stableRegisterSchema = z.object({
  type: z.literal('register'),
  secret: z.string(),
  window: z.object({ name: z.string() })
});

export type HookEvent = z.infer<typeof hookEventSchema>;
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

export function mismatchReply(
  raw: string
): Extract<ServerMessage, { type: 'result' | 'queryResult' }> | null {
  const request = parseMessage(stableRequestSchema, raw);
  if (!request) return null;
  return request.type === 'query'
    ? { type: 'queryResult', requestId: request.requestId, result: null, error: VERSION_MISMATCH }
    : { type: 'result', requestId: request.requestId, ok: false, error: VERSION_MISMATCH };
}
