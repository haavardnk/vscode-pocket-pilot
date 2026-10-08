import type {
  Agent,
  Model,
  Repository,
  SessionDetail,
  SessionSummary,
  WindowState
} from '@pocket-pilot/protocol';
import { differenceInCalendarDays } from 'date-fns';

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

type SessionGroupId = 'needsInput' | 'pinned' | 'today' | 'yesterday' | 'week' | 'older';

interface SessionGroup {
  id: SessionGroupId;
  label: string;
  entries: SessionEntry[];
}

export interface SessionSections {
  groups: SessionGroup[];
  archived: SessionEntry[];
}

const GROUP_LABELS: Record<SessionGroupId, string> = {
  needsInput: 'Needs input',
  pinned: 'Pinned',
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'Previous 7 days',
  older: 'Older'
};

export interface TerminalTarget {
  windowId: string;
  windowName: string;
  folderId: string | null;
  name: string;
}

function lastActivity(window: WindowState): number {
  return Math.max(0, ...window.sessions.map((session) => session.updatedAt));
}

export function activeChats(window: WindowState): number {
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
      group.running += activeChats(window);
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

function groupOf(session: SessionSummary, now: number): SessionGroupId {
  if (session.status === 'needsInput') return 'needsInput';
  if (session.pinned) return 'pinned';
  const days = differenceInCalendarDays(now, session.updatedAt);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return days < 7 ? 'week' : 'older';
}

export function sessionSections(
  windows: WindowState[],
  groups: RepositoryGroup[],
  key: string,
  now: number
): SessionSections {
  const entries = sessionEntries(windows, groups, key);
  const open = entries.filter((entry) => !entry.session.archived);
  return {
    groups: (Object.keys(GROUP_LABELS) as SessionGroupId[])
      .map((id) => ({
        id,
        label: GROUP_LABELS[id],
        entries: open.filter((entry) => groupOf(entry.session, now) === id)
      }))
      .filter((group) => group.entries.length > 0),
    archived: entries.filter((entry) => entry.session.archived)
  };
}

export function searchSessions(
  windows: WindowState[],
  groups: RepositoryGroup[],
  key: string,
  query: string
): SessionEntry[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return sessionEntries(windows, groups, key).filter((entry) => {
    const text = [entry.session.title, entry.session.preview ?? '', entry.windowName]
      .join('\n')
      .toLocaleLowerCase();
    return words.every((word) => text.includes(word));
  });
}

export function windowsForRepository(
  windows: WindowState[],
  groups: RepositoryGroup[],
  key: string
): WindowState[] {
  return windowsIn(windows, groups, key).toSorted((a, b) => lastActivity(b) - lastActivity(a));
}

export function terminalTargets(windows: WindowState[]): TerminalTarget[] {
  return windows.flatMap(({ windowId, name: windowName, folders }): TerminalTarget[] => [
    ...folders.map((folder) => ({ windowId, windowName, folderId: folder.id, name: folder.name })),
    { windowId, windowName, folderId: null, name: 'Home folder' }
  ]);
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
