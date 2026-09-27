import type { DiffContent } from '@pocket-pilot/protocol';
import { structuredPatch } from 'diff';

import { type Blob, isBinary } from './files';

const CONTEXT_LINES = 3;
const MAX_EDIT_LENGTH = 20_000;
const DIFF_TIMEOUT_MS = 2000;

export interface DiffCounts {
  additions: number | null;
  deletions: number | null;
}

export function diffBlobs(before: Blob, after: Blob): DiffContent {
  if (before === 'tooLarge' || after === 'tooLarge') return { kind: 'tooLarge' };
  const oldData = before === 'missing' ? Buffer.alloc(0) : before;
  const newData = after === 'missing' ? Buffer.alloc(0) : after;
  if (isBinary(oldData) || isBinary(newData)) return { kind: 'binary' };
  if (oldData.equals(newData)) return { kind: 'text', hunks: [] };
  const patch = structuredPatch(
    '',
    '',
    oldData.toString('utf8'),
    newData.toString('utf8'),
    undefined,
    undefined,
    { context: CONTEXT_LINES, maxEditLength: MAX_EDIT_LENGTH, timeout: DIFF_TIMEOUT_MS }
  );
  if (!patch) return { kind: 'tooLarge' };
  return {
    kind: 'text',
    hunks: patch.hunks.map((hunk) => ({
      oldStart: hunk.oldStart,
      newStart: hunk.newStart,
      lines: hunk.lines.filter((line) => !line.startsWith('\\'))
    }))
  };
}

export function diffCounts(diff: DiffContent): DiffCounts {
  if (diff.kind !== 'text') return { additions: null, deletions: null };
  const lines = diff.hunks.flatMap((hunk) => hunk.lines);
  return {
    additions: lines.filter((line) => line.startsWith('+')).length,
    deletions: lines.filter((line) => line.startsWith('-')).length
  };
}
