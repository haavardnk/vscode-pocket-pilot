import { graphql, GraphqlResponseError } from '@octokit/graphql';
import type { PullRequestState, Repository } from '@pocket-pilot/protocol';

import { errorMessage } from '../errors';
import {
  githubRepositories,
  type GitHubRepository,
  parsePullRequests,
  pullRequestQuery,
  repositoryErrors
} from './query';

const MIN_REFRESH_MS = 10_000;

export interface PollerOptions {
  enabled: () => boolean;
  intervalMs: () => number;
  token: () => Promise<string | null>;
  repositories: () => Repository[];
  publish: (state: PullRequestState) => void;
  report: (message: string) => void;
}

export class PullRequestPoller {
  private state: PullRequestState = {
    status: 'loading',
    fetchedAt: null,
    errors: [],
    pullRequests: []
  };
  private timer: NodeJS.Timeout | undefined;
  private active = false;
  private running: Promise<void> | null = null;
  private queued = false;
  private lastFetch = 0;
  private repositoryKey = '';

  constructor(private readonly options: PollerOptions) {}

  current(): PullRequestState {
    return this.state;
  }

  setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    if (active) this.refresh(true);
    else clearTimeout(this.timer);
  }

  repositoriesChanged(): void {
    const key = JSON.stringify(
      githubRepositories(this.options.repositories()).map((repository) => repository.key)
    );
    if (key === this.repositoryKey) return;
    this.repositoryKey = key;
    if (this.active) this.refresh(true);
  }

  refresh(force = false): void {
    if (!this.active) return;
    if (this.running) {
      this.queued ||= force;
      return;
    }
    if (!force && Date.now() - this.lastFetch < MIN_REFRESH_MS) return;
    clearTimeout(this.timer);
    this.running = this.poll().finally(() => {
      this.running = null;
      if (!this.active) return;
      if (this.queued) {
        this.queued = false;
        this.refresh(true);
        return;
      }
      this.timer = setTimeout(() => this.refresh(true), this.options.intervalMs());
    });
  }

  dispose(): void {
    this.active = false;
    clearTimeout(this.timer);
  }

  private async poll(): Promise<void> {
    this.lastFetch = Date.now();
    if (!this.options.enabled()) {
      this.publish({ status: 'disabled', fetchedAt: null, errors: [], pullRequests: [] });
      return;
    }
    const repositories = githubRepositories(this.options.repositories());
    this.repositoryKey = JSON.stringify(repositories.map((repository) => repository.key));
    const token = await this.options.token();
    if (!token) {
      this.publish({ status: 'signedOut', fetchedAt: null, errors: [], pullRequests: [] });
      return;
    }
    if (repositories.length === 0) {
      this.publish({ status: 'ready', fetchedAt: Date.now(), errors: [], pullRequests: [] });
      return;
    }
    if (this.state.status !== 'ready') this.publish({ ...this.state, status: 'loading' });
    this.publish(await this.fetch(repositories, token));
  }

  private async fetch(repositories: GitHubRepository[], token: string): Promise<PullRequestState> {
    const { query, variables } = pullRequestQuery(repositories);
    const request = graphql.defaults({ headers: { authorization: `bearer ${token}` } });
    try {
      const data = await request<unknown>(query, variables);
      return {
        status: 'ready',
        fetchedAt: Date.now(),
        errors: [],
        pullRequests: parsePullRequests(repositories, data)
      };
    } catch (error) {
      const errors =
        error instanceof GraphqlResponseError
          ? repositoryErrors(repositories, error.errors ?? [])
          : [];
      if (error instanceof GraphqlResponseError && errors.length > 0) {
        return {
          status: 'ready',
          fetchedAt: Date.now(),
          errors,
          pullRequests: parsePullRequests(repositories, error.data)
        };
      }
      const message = errorMessage(error);
      this.options.report(`Pull request refresh failed: ${message}`);
      if ((error as { status?: number }).status === 401) {
        return { status: 'signedOut', fetchedAt: null, errors: [], pullRequests: [] };
      }
      return {
        ...this.state,
        status: 'ready',
        errors: repositories.map((repository) => ({ repositoryKey: repository.key, message }))
      };
    }
  }

  private publish(state: PullRequestState): void {
    this.state = state;
    this.options.publish(state);
  }
}
