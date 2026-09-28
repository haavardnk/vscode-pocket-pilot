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

function unfence(part: JsonRecord, opens: boolean, closes: boolean): JsonRecord {
  if ((!opens && !closes) || part.kind !== undefined || typeof part.value !== 'string') return part;
  const stray = Number(opens) + Number(closes);
  const fences = part.value.match(FENCE_LINE)?.length ?? 0;
  if (fences < stray || (fences - stray) % 2 !== 0) return part;
  let value = part.value;
  if (closes) value = value.replace(CLOSING, '');
  if (opens) value = value.replace(OPENING, '');
  return { ...part, value };
}

export function withoutEditFences(response: JsonRecord[]): JsonRecord[] {
  const opening = new Set<number>();
  const closing = new Set<number>();
  response.forEach((part, index) => {
    if (part.kind !== 'codeblockUri') return;
    opening.add(neighbour(response, index, -1, BEFORE_BLOCK));
    closing.add(neighbour(response, index, 1, AFTER_BLOCK));
  });
  return response.map((part, index) => unfence(part, opening.has(index), closing.has(index)));
}
