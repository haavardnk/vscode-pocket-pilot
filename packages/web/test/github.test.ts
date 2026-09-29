import type { GitStatus, GitUpstream, Repository, WindowState } from '@pocket-pilot/protocol';
import { describe, expect, it } from 'vitest';

import { githubLinks, windowGitHub } from '../src/lib/github';

const SHA = '9c1e5d7f3a2b4c6d8e0f1a2b3c4d5e6f7a8b9c0d';
const BASE = 'https://github.com/o/r';
const GITHUB = { owner: 'o', name: 'r' };

function upstream(remote: string, ahead: number): GitUpstream {
  return { remote, branch: 'feat/a b', ahead, behind: 0 };
}

function window(githubs: Repository['github'][]): WindowState {
  return {
    windowId: 'w',
    name: 'w',
    workspace: null,
    repositories: githubs.map((github, index) => ({
      key: `k${index}`,
      label: `r${index}`,
      github
    })),
    folders: [],
    sessions: [],
    terminals: [],
    canOrganize: true,
    agents: [],
    models: []
  };
}

describe('githubLinks', () => {
  it.each<{ name: string; git: GitStatus | null; hrefs: string[] }>([
    { name: 'no git', git: null, hrefs: [BASE, `${BASE}/pulls`] },
    {
      name: 'pushed branch',
      git: { branch: 'feat/a b', commit: SHA, upstream: upstream('origin', 0), changed: 0 },
      hrefs: [
        BASE,
        `${BASE}/tree/feat/a%20b`,
        `${BASE}/commit/${SHA}`,
        `${BASE}/pulls?q=is%3Apr%20head%3Afeat%2Fa%20b`
      ]
    },
    {
      name: 'unpushed commits',
      git: { branch: 'feat/a b', commit: SHA, upstream: upstream('origin', 2), changed: 0 },
      hrefs: [BASE, `${BASE}/tree/feat/a%20b`, `${BASE}/pulls?q=is%3Apr%20head%3Afeat%2Fa%20b`]
    },
    {
      name: 'fork remote',
      git: { branch: 'feat/a b', commit: SHA, upstream: upstream('fork', 0), changed: 0 },
      hrefs: [BASE, `${BASE}/pulls`]
    },
    {
      name: 'detached',
      git: { branch: null, commit: SHA, upstream: null, changed: 0 },
      hrefs: [BASE, `${BASE}/commit/${SHA}`, `${BASE}/pulls`]
    }
  ])('links $name', ({ git, hrefs }) => {
    expect(githubLinks(GITHUB, git).map((link) => link.href)).toEqual(hrefs);
  });
});

describe('windowGitHub', () => {
  it.each<[string, Repository['github'][], Repository['github']]>([
    ['one GitHub repository', [GITHUB, null], GITHUB],
    ['two GitHub repositories', [GITHUB, { owner: 'o', name: 'other' }], null],
    ['a local repository', [null], null],
    ['no repository', [], null]
  ])('resolves %s', (_, githubs, expected) => {
    expect(windowGitHub(window(githubs))).toEqual(expected);
  });
});
