import type { RequestState, ResponsePart } from '@pocket-pilot/protocol';

export type Step = Extract<ResponsePart, { kind: 'thinking' | 'tool' | 'edit' }>;

export interface StepGroup {
  kind: 'group';
  title: string;
  active: boolean;
  steps: Step[];
  additions: number | null;
  deletions: number | null;
}

export type ResponseItem = Exclude<ResponsePart, { kind: 'thinking' }> | StepGroup;

const HEADER = /^\*\*([^*]+)\*\*/;

export function mergeMarkdown(parts: ResponsePart[]): ResponsePart[] {
  const merged: ResponsePart[] = [];
  for (const part of parts) {
    const previous = merged.at(-1);
    if (part.kind === 'markdown' && previous?.kind === 'markdown') {
      merged[merged.length - 1] = { kind: 'markdown', text: previous.text + part.text };
    } else merged.push(part);
  }
  return merged;
}

function isStep(part: ResponsePart): part is Step {
  return part.kind === 'thinking' || part.kind === 'edit' || (part.kind === 'tool' && part.grouped);
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

export function responseItems(parts: ResponsePart[], state: RequestState): ResponseItem[] {
  const items: ResponseItem[] = [];
  let run: Step[] = [];
  for (const part of mergeMarkdown(parts)) {
    if (part.kind === 'markdown' && !part.text.trim()) continue;
    if (isStep(part)) {
      run.push(part);
      continue;
    }
    if (run.length > 0) items.push(group(run, false));
    run = [];
    items.push(part);
  }
  if (run.length > 0) items.push(group(run, state === 'pending'));
  return items;
}
