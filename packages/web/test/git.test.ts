import type { GitStatus, WindowState } from '@pocket-pilot/protocol';
import { describe, expect, it } from 'vitest';

import { windowRef } from '../src/lib/git';

const SHA = '9c1e5d7f3a2b4c6d8e0f1a2b3c4d5e6f7a8b9c0d';

function git(branch: string | null): GitStatus {
  return { branch, commit: SHA, upstream: null, changed: 0 };
}

function window(statuses: (GitStatus | null)[]): WindowState {
  return {
    windowId: 'w',
    name: 'w',
    workspace: null,
    repositories: [],
    folders: statuses.map((status, index) => ({
      id: `f${index}`,
      name: `f${index}`,
      repositoryKey: null,
      git: status
    })),
    sessions: [],
    terminals: [],
    canOrganize: true,
    agents: [],
    models: []
  };
}

describe('windowRef', () => {
  it.each<[string, (GitStatus | null)[], string | null]>([
    ['one branch', [git('main'), null], 'main'],
    ['a detached head', [git(null)], '9c1e5d7'],
    ['folders on the same branch', [git('main'), git('main')], 'main'],
    ['folders on different branches', [git('main'), git('dev')], null],
    ['no repository', [null], null],
    ['an empty repository', [{ ...git(null), commit: null }], null]
  ])('labels %s', (_, statuses, expected) => {
    expect(windowRef(window(statuses))).toBe(expected);
  });
});
