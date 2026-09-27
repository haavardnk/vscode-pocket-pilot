import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { HookEvent } from '@pocket-pilot/protocol';
import { z } from 'zod';

import { asArray, asRecord, asString, parseJson } from '../json';
import { toolCallId } from '../sessions/transcript';

const EDIT_TOOLS = new Set([
  'create_file',
  'apply_patch',
  'insert_edit_into_file',
  'replace_string_in_file',
  'multi_replace_string_in_file',
  'edit_notebook_file',
  'edit_file'
]);
const PATH_KEYS = ['filePath', 'path', 'file_path', 'uri'];
const PATCH_FILE = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm;
const WORKSPACE_STORAGE = /[\\/]workspaceStorage[\\/]([^\\/]+)[\\/]/;

const payloadSchema = z.object({
  hook_event_name: z.string(),
  session_id: z.string().regex(/^[\w-]+$/),
  timestamp: z.string().optional(),
  transcript_path: z.string().optional(),
  prompt: z.string().optional(),
  tool_name: z.string().optional(),
  tool_input: z.unknown().optional(),
  tool_use_id: z.string().optional()
});

export interface ParsedHook {
  windowId: string | null;
  event: HookEvent;
}

function absolutePath(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith('file://')) return isAbsolute(value.trim()) ? value.trim() : null;
  try {
    return fileURLToPath(value);
  } catch {
    return null;
  }
}

export function editPaths(toolName: string, input: unknown): string[] {
  if (!EDIT_TOOLS.has(toolName)) return [];
  const record = asRecord(typeof input === 'string' ? parseJson(input) : input);
  const direct = PATH_KEYS.map((key) => asString(record[key]));
  const replaced = asArray(record.replacements).map((item) => asString(asRecord(item).filePath));
  const patched = [...(asString(record.input) ?? '').matchAll(PATCH_FILE)].map(
    (match) => match[1] ?? null
  );
  const paths = [...direct, ...replaced, ...patched].map(absolutePath);
  return [...new Set(paths.filter((path) => path !== null))];
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
        toolName: payload.tool_name ?? '',
        paths: editPaths(payload.tool_name ?? '', payload.tool_input)
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
