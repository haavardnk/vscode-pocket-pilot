import type { RequestState, ResponsePart } from '@pocket-pilot/protocol';

type Step = Extract<ResponsePart, { kind: 'thinking' | 'tool' | 'edit' }>;
type ToolPart = Extract<ResponsePart, { kind: 'tool' }>;

export interface StepGroup {
  kind: 'group';
  title: string;
  active: boolean;
  steps: Step[];
  additions: number | null;
  deletions: number | null;
}

export interface SubagentItem {
  kind: 'subagent';
  part: ToolPart;
  steps: ToolPart[];
}

export type ResponseItem = Exclude<ResponsePart, { kind: 'thinking' }> | StepGroup | SubagentItem;

const HEADER = /^\*\*([^*]+)\*\*/;

function mergeMarkdown(parts: ResponsePart[]): ResponsePart[] {
  const merged: ResponsePart[] = [];
  for (const part of parts) {
    const previous = merged.at(-1);
    if (part.kind === 'markdown' && previous?.kind === 'markdown') {
      merged[merged.length - 1] = { kind: 'markdown', text: previous.text + part.text };
    } else merged.push(part);
  }
  return merged;
}

function titleOf(steps: Step[], kind: 'thinking' | 'tool'): string | undefined {
  return steps.flatMap((step) => (step.kind === kind && step.title ? [step.title] : []))[0];
}

function finishedTitle(steps: Step[], actions: number): string {
  const first = steps[0];
  const generated =
    (first?.kind === 'thinking' ? first.title : null) ??
    titleOf(steps, 'tool') ??
    titleOf(steps, 'thinking');
  if (generated) return generated;
  const headers = steps.flatMap((step) =>
    step.kind === 'thinking' ? (HEADER.exec(step.text)?.slice(1) ?? []) : []
  );
  if (headers.length === 1 && actions === 0 && headers[0]) return headers[0];
  if (actions === 0) return 'Finished Working';
  return actions === 1 ? 'Finished with 1 step' : `Finished with ${actions} steps`;
}

function group(steps: Step[], active: boolean): ResponseItem {
  const actions = steps.filter((step) => step.kind !== 'thinking').length;
  const only = steps[0];
  if (!active && steps.length === 1 && only && only.kind !== 'thinking') return only;
  const counts = steps.flatMap((step) =>
    step.kind === 'edit' && step.additions !== null && step.deletions !== null
      ? [[step.additions, step.deletions] as const]
      : []
  );
  return {
    kind: 'group',
    title: active ? 'Working' : finishedTitle(steps, actions),
    active,
    steps,
    additions: counts.length > 0 ? counts.reduce((total, [added]) => total + added, 0) : null,
    deletions: counts.length > 0 ? counts.reduce((total, [, removed]) => total + removed, 0) : null
  };
}

function subagentSteps(parts: ResponsePart[]): Map<string, ToolPart[]> {
  const children = new Map<string, ToolPart[]>(
    parts.flatMap((part) => (part.kind === 'tool' && part.subagent ? [[part.callId, []]] : []))
  );
  for (const part of parts) {
    if (part.kind === 'tool' && part.parentCallId) children.get(part.parentCallId)?.push(part);
  }
  return children;
}

export function responseItems(
  parts: ResponsePart[],
  state: RequestState,
  compact = false
): ResponseItem[] {
  const items: ResponseItem[] = [];
  const children = subagentSteps(parts);
  const shown = compact
    ? parts.filter((part) => part.kind !== 'thinking' && part.kind !== 'progress')
    : parts;
  let run: Step[] = [];
  for (const part of mergeMarkdown(shown)) {
    if (part.kind === 'markdown' && !part.text.trim()) continue;
    if (part.kind === 'tool' && part.parentCallId && children.has(part.parentCallId)) continue;
    if (
      part.kind === 'thinking' ||
      (!compact && (part.kind === 'edit' || (part.kind === 'tool' && part.grouped)))
    ) {
      run.push(part);
      continue;
    }
    if (run.length > 0) items.push(group(run, false));
    run = [];
    const steps = part.kind === 'tool' ? children.get(part.callId) : undefined;
    items.push(part.kind === 'tool' && steps ? { kind: 'subagent', part, steps } : part);
  }
  if (run.length > 0) items.push(group(run, state === 'pending'));
  return items;
}
