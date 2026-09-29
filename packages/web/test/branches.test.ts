import type { BranchResult } from '@pocket-pilot/protocol';
import { describe, expect, it } from 'vitest';

import { branchSections } from '../src/lib/branches';

const result: BranchResult = {
  kind: 'branches',
  current: 'feat/b',
  local: [
    { name: 'main', commit: null, worktree: null },
    { name: 'feat/b', commit: null, worktree: null }
  ],
  remote: [
    { remote: 'origin', name: 'feat/c', commit: null },
    { remote: 'fork', name: 'fix', commit: null }
  ]
};

describe('branchSections', () => {
  it.each<[string, string[], string[]]>([
    ['', ['feat/b', 'main'], ['feat/c', 'fix']],
    ['FEAT', ['feat/b'], ['feat/c']],
    ['fork/', [], ['fix']]
  ])('filters by %j with the current branch first', (search, local, remote) => {
    const sections = branchSections(result, search);
    expect(sections.local.map((branch) => branch.name)).toEqual(local);
    expect(sections.remote.map((branch) => branch.name)).toEqual(remote);
  });
});
