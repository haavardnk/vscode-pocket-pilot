import type { HookEvent } from '@pocket-pilot/protocol';
import { z } from 'zod';

import { toolCallId } from '../sessions/transcript';

const WORKSPACE_STORAGE = /[\\/]workspaceStorage[\\/]([^\\/]+)[\\/]/;

const payloadSchema = z.object({
  hook_event_name: z.string(),
  session_id: z.string().regex(/^[\w-]+$/),
  timestamp: z.string().optional(),
  transcript_path: z.string().optional(),
  prompt: z.string().optional(),
  tool_name: z.string().optional(),
  tool_use_id: z.string().optional()
});

export interface ParsedHook {
  windowId: string | null;
  event: HookEvent;
}

function hookEvent(payload: z.infer<typeof payloadSchema>): HookEvent | null {
  const sessionId = payload.session_id;
  const at = Date.parse(payload.timestamp ?? '') || Date.now();
  const callId = payload.tool_use_id ? toolCallId(payload.tool_use_id) : null;
  switch (payload.hook_event_name) {
    case 'UserPromptSubmit':
      return { kind: 'prompt', sessionId, at, prompt: payload.prompt ?? '' };
    case 'PreToolUse':
      if (!callId) return null;
      return {
        kind: 'toolStart',
        sessionId,
        at,
        callId,
        toolName: payload.tool_name ?? ''
      };
    case 'PostToolUse':
      return callId ? { kind: 'toolEnd', sessionId, at, callId } : null;
    case 'Stop':
      return { kind: 'stop', sessionId, at };
    default:
      return null;
  }
}

export function parseHook(body: unknown): ParsedHook | null {
  const payload = payloadSchema.safeParse(body);
  if (!payload.success) return null;
  const event = hookEvent(payload.data);
  if (!event) return null;
  const windowId = WORKSPACE_STORAGE.exec(payload.data.transcript_path ?? '')?.[1] ?? null;
  return { windowId, event };
}
