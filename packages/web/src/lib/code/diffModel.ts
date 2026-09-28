import type { DiffHunk } from '@pocket-pilot/protocol';

type DiffLineKind = 'context' | 'added' | 'removed';

interface DiffLine {
  kind: DiffLineKind;
  oldLine: number | null;
  newLine: number | null;
  text: string;
  side: 'old' | 'new';
  index: number;
}

interface DiffGap {
  kind: 'gap';
  hidden: number;
}

type DiffRow = DiffLine | DiffGap;

export interface DiffModel {
  rows: DiffRow[];
  oldText: string;
  newText: string;
}

export function diffModel(hunks: DiffHunk[]): DiffModel {
  const rows: DiffRow[] = [];
  const oldLines: string[] = [];
  const newLines: string[] = [];
  let nextOld = 1;
  for (const hunk of hunks) {
    if (hunk.oldStart > nextOld) rows.push({ kind: 'gap', hidden: hunk.oldStart - nextOld });
    let oldLine = hunk.oldStart;
    let newLine = hunk.newStart;
    for (const line of hunk.lines) {
      const text = line.slice(1);
      if (line.startsWith('+')) {
        rows.push({
          kind: 'added',
          oldLine: null,
          newLine,
          text,
          side: 'new',
          index: newLines.length
        });
        newLines.push(text);
        newLine += 1;
      } else if (line.startsWith('-')) {
        rows.push({
          kind: 'removed',
          oldLine,
          newLine: null,
          text,
          side: 'old',
          index: oldLines.length
        });
        oldLines.push(text);
        oldLine += 1;
      } else {
        rows.push({ kind: 'context', oldLine, newLine, text, side: 'new', index: newLines.length });
        oldLines.push(text);
        newLines.push(text);
        oldLine += 1;
        newLine += 1;
      }
    }
    nextOld = oldLine;
  }
  return { rows, oldText: oldLines.join('\n'), newText: newLines.join('\n') };
}
