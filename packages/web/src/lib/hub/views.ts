import type {
  Agent,
  Model,
  PullRequest,
  PullRequestState,
  Repository,
  SessionDetail,
  SessionSummary,
  WindowState
} from '@pocket-pilot/protocol';

export const ALL_REPOSITORIES = '*';
export const NO_REPOSITORY = 'none';

export interface RepositoryGroup {
  key: string;
  label: string;
  github: Repository['github'];
  windowIds: string[];
  updatedAt: number;
  running: number;
}

export interface SessionEntry {
  windowId: string;
  windowName: string;
  canOrganize: boolean;
  session: SessionSummary;
}

export interface SessionSections {
  pinned: SessionEntry[];
  recent: SessionEntry[];
  archived: SessionEntry[];
}

export interface TerminalTarget {
  windowId: string;
  windowName: string;
  folderId: string | null;
  name: string;
}

function lastActivity(window: WindowState): number {
  return Math.max(0, ...window.sessions.map((session) => session.updatedAt));
}

function busyCount(window: WindowState): number {
  return window.sessions.filter(
    (session) => session.status === 'running' || session.status === 'needsInput'
  ).length;
}

function windowRepositories(window: WindowState): Repository[] {
  return window.repositories.length > 0
    ? window.repositories
    : [{ key: NO_REPOSITORY, label: 'No repository', github: null }];
}

export function repositoryGroups(windows: WindowState[]): RepositoryGroup[] {
  const groups = new Map<string, RepositoryGroup>();
  for (const window of windows) {
    for (const repository of windowRepositories(window)) {
      const group = groups.get(repository.key) ?? {
        key: repository.key,
        label: repository.label,
        github: repository.github,
        windowIds: [],
        updatedAt: 0,
        running: 0
      };
      group.windowIds.push(window.windowId);
      group.updatedAt = Math.max(group.updatedAt, lastActivity(window));
      group.running += busyCount(window);
      groups.set(repository.key, group);
    }
  }
  return [...groups.values()].sort(
    (a, b) => b.updatedAt - a.updatedAt || a.label.localeCompare(b.label)
  );
}

export function resolveRepository(groups: RepositoryGroup[], stored: string | null): string {
  if (stored === ALL_REPOSITORIES || groups.some((group) => group.key === stored))
    return stored ?? ALL_REPOSITORIES;
  return groups.length === 1 ? (groups[0]?.key ?? ALL_REPOSITORIES) : ALL_REPOSITORIES;
}

function windowsIn(windows: WindowState[], groups: RepositoryGroup[], key: string): WindowState[] {
  if (key === ALL_REPOSITORIES) return windows;
  const ids = new Set(groups.find((group) => group.key === key)?.windowIds ?? []);
  return windows.filter((window) => ids.has(window.windowId));
}

export function sessionEntries(
  windows: WindowState[],
  groups: RepositoryGroup[],
  key: string
): SessionEntry[] {
  return windowsIn(windows, groups, key)
    .flatMap((window) =>
      window.sessions.map((session) => ({
        windowId: window.windowId,
        windowName: window.name,
        canOrganize: window.canOrganize,
        session
      }))
    )
    .sort((a, b) => b.session.updatedAt - a.session.updatedAt);
}

export function sessionSections(
  windows: WindowState[],
  groups: RepositoryGroup[],
  key: string
): SessionSections {
  const entries = sessionEntries(windows, groups, key);
  return {
    pinned: entries.filter((entry) => entry.session.pinned && !entry.session.archived),
    recent: entries.filter((entry) => !entry.session.pinned && !entry.session.archived),
    archived: entries.filter((entry) => entry.session.archived)
  };
}

export function windowsForRepository(
  windows: WindowState[],
  groups: RepositoryGroup[],
  key: string
): WindowState[] {
  return windowsIn(windows, groups, key).toSorted((a, b) => lastActivity(b) - lastActivity(a));
}

export function terminalTargets(windows: WindowState[]): TerminalTarget[] {
  return windows.flatMap(({ windowId, name: windowName, folders }): TerminalTarget[] =>
    folders.length === 0
      ? [{ windowId, windowName, folderId: null, name: windowName }]
      : folders.map((folder) => ({ windowId, windowName, folderId: folder.id, name: folder.name }))
  );
}

export function pullRequestsFor(state: PullRequestState, key: string): PullRequest[] {
  const pullRequests =
    key === ALL_REPOSITORIES
      ? state.pullRequests
      : state.pullRequests.filter((pullRequest) => pullRequest.repositoryKey === key);
  return pullRequests.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function basename(value: string): string {
  const name = decodeURIComponent(value.split(/[\\/]/).at(-1) ?? value);
  return name.replace(/\.(agent|chatmode)\.md$/, '').replace(/\.md$/, '');
}

export function agentLabel(agents: Agent[], modeId: string | null): string {
  if (!modeId) return 'Agent';
  const agent = agents.find((candidate) => candidate.id === modeId);
  if (agent) return agent.name;
  if (modeId.includes('/')) return basename(modeId);
  return modeId.charAt(0).toUpperCase() + modeId.slice(1);
}

export function findModel(models: Model[], modelId: string | null): Model | null {
  if (!modelId) return null;
  return models.find((model) => model.id === modelId || model.id === `copilot/${modelId}`) ?? null;
}

export function modelLabel(models: Model[], modelId: string | null): string {
  if (!modelId) return 'Default model';
  return findModel(models, modelId)?.name ?? modelId.split('/').at(-1) ?? modelId;
}

export interface PendingTool {
  callId: string;
  toolId: string;
  message: string;
  detail: string | null;
}

export function pendingTool(detail: SessionDetail | null): PendingTool | null {
  const parts = detail?.requests.at(-1)?.parts ?? [];
  const part = parts.findLast(
    (candidate) => candidate.kind === 'tool' && candidate.awaitingConfirmation
  );
  return part?.kind === 'tool'
    ? { callId: part.callId, toolId: part.toolId, message: part.message, detail: part.detail }
    : null;
}
