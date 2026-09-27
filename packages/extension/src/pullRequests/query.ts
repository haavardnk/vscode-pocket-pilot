import type { PullRequest, Repository } from '@pocket-pilot/protocol';

import { asArray, asNumber, asRecord, asString } from '../json';

export const PULL_REQUEST_LIMIT = 30;

export interface GitHubRepository {
  key: string;
  owner: string;
  name: string;
}

const FIELDS = `
  pullRequests(states: OPEN, first: ${PULL_REQUEST_LIMIT}, orderBy: { field: UPDATED_AT, direction: DESC }) {
    nodes {
      number
      title
      url
      isDraft
      headRefName
      baseRefName
      updatedAt
      additions
      deletions
      mergeable
      reviewDecision
      author { login }
      commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
    }
  }`;

export function githubRepositories(repositories: readonly Repository[]): GitHubRepository[] {
  const unique = new Map<string, GitHubRepository>();
  for (const repository of repositories) {
    if (repository.github)
      unique.set(repository.key, { key: repository.key, ...repository.github });
  }
  return [...unique.values()];
}

export function pullRequestQuery(repositories: readonly GitHubRepository[]): {
  query: string;
  variables: Record<string, string>;
} {
  const variables: Record<string, string> = {};
  const parameters: string[] = [];
  const fields = repositories.map((repository, index) => {
    variables[`owner${index}`] = repository.owner;
    variables[`name${index}`] = repository.name;
    parameters.push(`$owner${index}: String!`, `$name${index}: String!`);
    return `r${index}: repository(owner: $owner${index}, name: $name${index}) {${FIELDS}\n}`;
  });
  return { query: `query(${parameters.join(', ')}) {\n${fields.join('\n')}\n}`, variables };
}

function checks(node: Record<string, unknown>): PullRequest['checks'] {
  const commit = asRecord(asRecord(asArray(asRecord(node.commits).nodes)[0]).commit);
  const state = asString(asRecord(commit.statusCheckRollup).state);
  if (state === 'SUCCESS') return 'success';
  if (state === 'FAILURE' || state === 'ERROR') return 'failure';
  if (state === 'PENDING' || state === 'EXPECTED') return 'pending';
  return 'none';
}

function review(decision: string | null): PullRequest['review'] {
  if (decision === 'APPROVED') return 'approved';
  if (decision === 'CHANGES_REQUESTED') return 'changesRequested';
  if (decision === 'REVIEW_REQUIRED') return 'reviewRequired';
  return 'none';
}

function mergeable(value: string | null): PullRequest['mergeable'] {
  if (value === 'MERGEABLE') return 'mergeable';
  if (value === 'CONFLICTING') return 'conflicting';
  return 'unknown';
}

function pullRequest(repositoryKey: string, value: unknown): PullRequest | null {
  const node = asRecord(value);
  const number = asNumber(node.number);
  const title = asString(node.title);
  const url = asString(node.url);
  if (number === null || title === null || url === null) return null;
  return {
    repositoryKey,
    number,
    title,
    url,
    author: asString(asRecord(node.author).login),
    isDraft: node.isDraft === true,
    headRef: asString(node.headRefName) ?? '',
    baseRef: asString(node.baseRefName) ?? '',
    updatedAt: asString(node.updatedAt) ?? '',
    checks: checks(node),
    review: review(asString(node.reviewDecision)),
    mergeable: mergeable(asString(node.mergeable)),
    additions: asNumber(node.additions) ?? 0,
    deletions: asNumber(node.deletions) ?? 0
  };
}

export function parsePullRequests(
  repositories: readonly GitHubRepository[],
  data: unknown
): PullRequest[] {
  const root = asRecord(data);
  return repositories.flatMap((repository, index) =>
    asArray(asRecord(asRecord(root[`r${index}`]).pullRequests).nodes).flatMap((node) => {
      const parsed = pullRequest(repository.key, node);
      return parsed ? [parsed] : [];
    })
  );
}

export function repositoryErrors(
  repositories: readonly GitHubRepository[],
  errors: readonly { message: string; path?: readonly (string | number)[] }[]
): { repositoryKey: string; message: string }[] {
  return errors.flatMap((error) => {
    const alias = error.path?.[0];
    const index = typeof alias === 'string' && /^r\d+$/.test(alias) ? Number(alias.slice(1)) : -1;
    const repository = repositories[index];
    return repository ? [{ repositoryKey: repository.key, message: error.message }] : [];
  });
}
