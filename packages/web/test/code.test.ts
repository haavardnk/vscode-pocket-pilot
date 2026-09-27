import { describe, expect, it } from 'vitest';

import { diffModel } from '../src/lib/code/diffModel';
import { resolveLanguage } from '../src/lib/code/languages';
import { baseName, parentPath } from '../src/lib/code/paths';

describe('paths', () => {
  it.each([
    ['src/lib/a.ts', 'src/lib', 'a.ts'],
    ['a.ts', '', 'a.ts'],
    ['C:\\repo\\b.ts', 'C:\\repo', 'b.ts'],
    ['', '', '']
  ])('splits %s', (path, parent, name) => {
    expect(parentPath(path)).toBe(parent);
    expect(baseName(path)).toBe(name);
  });
});

const KNOWN = new Set(['typescript', 'tsx', 'python', 'yaml', 'rs', 'ts']);

describe('resolveLanguage', () => {
  it.each([
    ['typescript', 'a.ts', 'typescript'],
    ['typescriptreact', 'a.tsx', 'tsx'],
    ['dockercompose', 'compose.yml', 'yaml'],
    ['unknown', 'lib.rs', 'rs'],
    [null, 'src/main.ts', 'ts'],
    ['plaintext', 'notes.ts', null],
    [null, 'Makefile', null],
    [null, 'notes.log', null]
  ])('maps %s for %s', (languageId, path, expected) => {
    expect(resolveLanguage(languageId, path, (id) => KNOWN.has(id))).toBe(expected);
  });
});

describe('diffModel', () => {
  it('numbers lines, splits sides and marks hidden ranges', () => {
    const model = diffModel([
      { oldStart: 1, newStart: 1, lines: [' a', '-b', '+B', '+C'] },
      { oldStart: 10, newStart: 11, lines: [' j', '-k'] }
    ]);
    expect(model.rows).toEqual([
      { kind: 'context', oldLine: 1, newLine: 1, text: 'a', side: 'new', index: 0 },
      { kind: 'removed', oldLine: 2, newLine: null, text: 'b', side: 'old', index: 1 },
      { kind: 'added', oldLine: null, newLine: 2, text: 'B', side: 'new', index: 1 },
      { kind: 'added', oldLine: null, newLine: 3, text: 'C', side: 'new', index: 2 },
      { kind: 'gap', hidden: 7 },
      { kind: 'context', oldLine: 10, newLine: 11, text: 'j', side: 'new', index: 3 },
      { kind: 'removed', oldLine: 11, newLine: null, text: 'k', side: 'old', index: 3 }
    ]);
    expect(model.oldText).toBe('a\nb\nj\nk');
    expect(model.newText).toBe('a\nB\nC\nj');
  });
});
