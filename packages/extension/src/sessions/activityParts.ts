import type { ResponsePart, ToolStatus } from '@pocket-pilot/protocol';

import { editPaths } from '../hooks/hookEvent';
import { asRecord, parseJson } from '../json';
import { clip, DETAIL_LENGTH } from './partText';
import { toolLabel } from './toolLabels';
import { groupedByName } from './toolParts';
import type { TranscriptEvent } from './transcript';

type ActivityPart = Extract<ResponsePart, { kind: 'tool' | 'edit' | 'thinking' | 'markdown' }>;
type ToolStart = Extract<TranscriptEvent, { type: 'toolStart' }>;

const HIDDEN_EDIT_TOOLS = new Set([
  'replace_string_in_file',
  'multi_replace_string_in_file',
  'apply_patch',
  'edit_notebook_file'
]);
const HIDDEN_TOOLS = new Set(['task_complete']);

export interface Activity {
  statuses: ReadonlyMap<string, ToolStatus>;
  events: readonly TranscriptEvent[];
  toolsOnly: boolean;
  settled: boolean;
}

export function toolStatuses(events: readonly TranscriptEvent[]): Map<string, ToolStatus> {
  const statuses = new Map<string, ToolStatus>();
  for (const event of events) {
    if (event.type === 'toolStart' && !statuses.has(event.callId)) {
      statuses.set(event.callId, 'running');
    }
    if (event.type === 'toolEnd') statuses.set(event.callId, event.success ? 'done' : 'failed');
  }
  return statuses;
}

function toolParts(event: ToolStart, status: ToolStatus): ActivityPart[] {
  if (HIDDEN_TOOLS.has(event.name)) return [];
  const args = event.args === null ? null : parseJson(event.args);
  if (HIDDEN_EDIT_TOOLS.has(event.name)) {
    return editPaths(event.name, args).map((path) => ({
      kind: 'edit',
      path,
      stopId: null,
      callId: event.callId,
      additions: null,
      deletions: null
    }));
  }
  return [
    {
      kind: 'tool',
      callId: event.callId,
      toolId: event.name,
      message: toolLabel(event.name, asRecord(args), status),
      detail: event.args && clip(event.args, DETAIL_LENGTH),
      title: null,
      grouped: groupedByName(event.name),
      awaitingConfirmation: false,
      status,
      terminal: null
    }
  ];
}

export function activityParts(
  events: readonly TranscriptEvent[],
  statuses: ReadonlyMap<string, ToolStatus>,
  toolsOnly: boolean
): ActivityPart[] {
  const running = new Set<string>();
  const parts: ActivityPart[] = [];
  for (const event of events) {
    if (event.type === 'toolStart') {
      running.add(event.callId);
      parts.push(...toolParts(event, statuses.get(event.callId) ?? 'running'));
    } else if (event.type === 'toolEnd') {
      running.delete(event.callId);
    } else if (event.type === 'message' && running.size === 0 && !toolsOnly) {
      const reasoning = event.reasoning?.trim();
      if (reasoning) parts.push({ kind: 'thinking', text: reasoning, title: null });
      if (event.text) parts.push({ kind: 'markdown', text: event.text });
    }
  }
  return parts;
}

export function withActivity(parts: ResponsePart[], activity: Activity): ResponsePart[] {
  const tools = new Set(parts.flatMap((part) => (part.kind === 'tool' ? [part.callId] : [])));
  const edits = new Set(
    parts.flatMap((part) => (part.kind === 'edit' ? [`${part.callId}\0${part.path}`] : []))
  );
  const shown = parts
    .map((part) => (part.kind === 'markdown' || part.kind === 'thinking' ? part.text : ''))
    .join('\n');
  const merged = [...parts];
  for (const part of activityParts(activity.events, activity.statuses, activity.toolsOnly)) {
    const previous = merged.at(-1);
    const fresh =
      part.kind === 'tool'
        ? !tools.has(part.callId)
        : part.kind === 'edit'
          ? !edits.has(`${part.callId}\0${part.path}`) &&
            !(previous?.kind === 'edit' && previous.path === part.path)
          : !shown.includes(part.text.trim());
    if (fresh) merged.push(part);
  }
  return merged;
}
