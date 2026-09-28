import type { JsonRecord } from '../json';

const FENCE_LINE = /^[ \t]*```/gm;
const OPENING = /\s*```[^\n]*\s*$/;
const CLOSING = /^\s*```[ \t]*\n?\s*/;
const BEFORE_BLOCK = new Set<unknown>(['undoStop']);
const AFTER_BLOCK = new Set<unknown>(['undoStop', 'textEditGroup', 'notebookEditGroup']);

function neighbour(
  parts: JsonRecord[],
  from: number,
  step: 1 | -1,
  skip: ReadonlySet<unknown>
): number {
  let index = from + step;
  while (index >= 0 && index < parts.length && skip.has(parts[index]?.kind)) index += step;
  return index;
}

function unfence(parts: JsonRecord[], index: number, fence: RegExp): void {
  const part = parts[index];
  if (!part || part.kind !== undefined || typeof part.value !== 'string') return;
  if ((part.value.match(FENCE_LINE)?.length ?? 0) % 2 === 0) return;
  parts[index] = { ...part, value: part.value.replace(fence, '') };
}

export function withoutEditFences(response: JsonRecord[]): JsonRecord[] {
  const parts = [...response];
  parts.forEach((part, index) => {
    if (part.kind !== 'codeblockUri') return;
    unfence(parts, neighbour(parts, index, -1, BEFORE_BLOCK), OPENING);
    unfence(parts, neighbour(parts, index, 1, AFTER_BLOCK), CLOSING);
  });
  return parts;
}
