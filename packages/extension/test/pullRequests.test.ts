import { describe, expect, it } from 'vitest';

import {
  githubRepositories,
  parsePullRequests,
  pullRequestQuery,
  repositoryErrors
} from '../src/pullRequests/query';

const repositories = githubRepositories([
  { key: 'github.com/a/one', label: 'a/one', github: { owner: 'a', name: 'one' } },
  { key: 'github.com/a/one', label: 'a/one', github: { owner: 'a', name: 'one' } },
  { key: 'local/scratch', label: 'scratch', github: null },
  { key: 'github.com/b/two', label: 'b/two', github: { owner: 'b', name: 'two' } }
]);

describe('pull request query', () => {
  it('batches unique GitHub repositories into aliased variables', () => {
    expect(repositories.map((repository) => repository.key)).toEqual([
      'github.com/a/one',
      'github.com/b/two'
    ]);
    const { query, variables } = pullRequestQuery(repositories);
    expect(variables).toEqual({ owner0: 'a', name0: 'one', owner1: 'b', name1: 'two' });
    expect(query).toContain('r1: repository(owner: $owner1, name: $name1)');
  });

  it('maps GitHub states and per-repository errors', () => {
    const data = {
      r0: {
        pullRequests: {
          nodes: [
            {
              number: 7,
              title: 'Add thing',
              url: 'https://github.com/a/one/pull/7',
              isDraft: false,
              headRefName: 'feature',
              baseRefName: 'main',
              updatedAt: '2026-01-01T00:00:00Z',
              additions: 3,
              deletions: 1,
              mergeable: 'CONFLICTING',
              reviewDecision: 'CHANGES_REQUESTED',
              author: { login: 'octo' },
              commits: { nodes: [{ commit: { statusCheckRollup: { state: 'ERROR' } } }] }
            },
            { number: 8 }
          ]
        }
      },
      r1: null
    };
    expect(parsePullRequests(repositories, data)).toEqual([
      {
        repositoryKey: 'github.com/a/one',
        number: 7,
        title: 'Add thing',
        url: 'https://github.com/a/one/pull/7',
        author: 'octo',
        isDraft: false,
        headRef: 'feature',
        baseRef: 'main',
        updatedAt: '2026-01-01T00:00:00Z',
        checks: 'failure',
        review: 'changesRequested',
        mergeable: 'conflicting',
        additions: 3,
        deletions: 1
      }
    ]);
    expect(
      repositoryErrors(repositories, [
        { message: 'Could not resolve', path: ['r1'] },
        { message: 'Rate limited' }
      ])
    ).toEqual([{ repositoryKey: 'github.com/b/two', message: 'Could not resolve' }]);
  });
});
