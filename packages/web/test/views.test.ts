import type { SessionDetail, SessionSummary, WindowState } from '@pocket-pilot/protocol';
import { describe, expect, it } from 'vitest';

import {
  agentLabel,
  ALL_REPOSITORIES,
  modelLabel,
  NO_REPOSITORY,
  pendingTool,
  repositoryGroups,
  resolveRepository,
  searchSessions,
  sessionEntries,
  sessionSections,
  terminalTargets
} from '../src/lib/hub/views';
import { inChat, pairCode, parseRoute, type Route, routeHash } from '../src/lib/routing';

function session(
  id: string,
  updatedAt: number,
  status: SessionSummary['status'] = 'idle',
  flags: Partial<Pick<SessionSummary, 'pinned' | 'archived'>> = {}
): SessionSummary {
  return {
    id,
    title: id,
    createdAt: 0,
    updatedAt,
    status,
    lastRequestState: null,
    modelId: null,
    modeId: null,
    requestCount: 1,
    preview: null,
    pinned: false,
    archived: false,
    ...flags
  };
}

function window(windowId: string, keys: string[], sessions: SessionSummary[]): WindowState {
  return {
    windowId,
    name: windowId,
    workspace: null,
    repositories: keys.map((key) => ({ key, label: key.split('/').at(-1) ?? key, github: null })),
    folders: [],
    sessions,
    terminals: [],
    canOrganize: true,
    agents: [],
    models: []
  };
}

const WINDOWS = [
  window('w1', ['github.com/a/app', 'github.com/a/lib'], [session('s1', 10, 'running')]),
  window('w2', ['github.com/a/app'], [session('s2', 30)]),
  window('w3', [], [session('s3', 20, 'needsInput')])
];

describe('repositoryGroups', () => {
  it('groups windows by repository and orders by activity', () => {
    const groups = repositoryGroups(WINDOWS);
    expect(groups.map((group) => [group.key, group.windowIds, group.running])).toEqual([
      ['github.com/a/app', ['w1', 'w2'], 1],
      [NO_REPOSITORY, ['w3'], 1],
      ['github.com/a/lib', ['w1'], 1]
    ]);
  });

  it.each([
    [null, ALL_REPOSITORIES],
    ['github.com/a/lib', 'github.com/a/lib'],
    ['github.com/gone/repo', ALL_REPOSITORIES],
    [ALL_REPOSITORIES, ALL_REPOSITORIES]
  ])('resolves stored repository %s', (stored, expected) => {
    expect(resolveRepository(repositoryGroups(WINDOWS), stored)).toBe(expected);
  });

  it('selects the only repository when there is one', () => {
    expect(
      resolveRepository(repositoryGroups([window('w2', ['github.com/a/app'], [])]), null)
    ).toBe('github.com/a/app');
  });

  it('lists sessions of the selected repository newest first', () => {
    const groups = repositoryGroups(WINDOWS);
    expect(
      sessionEntries(WINDOWS, groups, 'github.com/a/app').map((entry) => entry.session.id)
    ).toEqual(['s2', 's1']);
    expect(
      sessionEntries(WINDOWS, groups, ALL_REPOSITORIES).map((entry) => entry.session.id)
    ).toEqual(['s2', 's3', 's1']);
  });

  it('groups chats by attention, pin and day, archive winning over everything', () => {
    const now = new Date(2025, 5, 10, 12).getTime();
    const hoursAgo = (hours: number): number => now - hours * 3_600_000;
    const windows = [
      window(
        'w1',
        [],
        [
          session('today', hoursAgo(1)),
          session('yesterday', hoursAgo(20)),
          session('week', hoursAgo(24 * 5)),
          session('older', hoursAgo(24 * 30)),
          session('asking', hoursAgo(24 * 30), 'needsInput', { pinned: true }),
          session('pinned', hoursAgo(24 * 30), 'idle', { pinned: true }),
          session('archived', hoursAgo(2), 'needsInput', { archived: true }),
          session('both', hoursAgo(3), 'idle', { pinned: true, archived: true })
        ]
      )
    ];
    const { groups, archived } = sessionSections(
      windows,
      repositoryGroups(windows),
      ALL_REPOSITORIES,
      now
    );
    expect(
      groups.map((group) => [group.label, group.entries.map((entry) => entry.session.id)])
    ).toEqual([
      ['Needs input', ['asking']],
      ['Pinned', ['pinned']],
      ['Today', ['today']],
      ['Yesterday', ['yesterday']],
      ['Previous 7 days', ['week']],
      ['Older', ['older']]
    ]);
    expect(archived.map((entry) => entry.session.id)).toEqual(['archived', 'both']);
  });

  it('searches titles, previews and windows including archived chats', () => {
    const windows = [
      window(
        'w1',
        [],
        [
          { ...session('Fix login', 30), preview: 'Token expiry is off by one' },
          { ...session('Old work', 20, 'idle', { archived: true }), preview: 'login page' },
          session('Other', 10)
        ]
      )
    ];
    const search = (query: string): string[] =>
      searchSessions(windows, repositoryGroups(windows), ALL_REPOSITORIES, query).map(
        (entry) => entry.session.id
      );
    expect(search('LOGIN')).toEqual(['Fix login', 'Old work']);
    expect(search('expiry fix')).toEqual(['Fix login']);
    expect(search('w1 other')).toEqual(['Other']);
    expect(search('missing')).toEqual([]);
  });
});

describe('terminalTargets', () => {
  it('offers each folder, or the window itself when it has none', () => {
    const windows = [
      {
        ...window('w1', [], []),
        folders: [
          { id: 'f1', name: 'app', repositoryKey: null, git: null },
          { id: 'f2', name: 'lib', repositoryKey: null, git: null }
        ]
      },
      window('w2', [], [])
    ];
    expect(terminalTargets(windows)).toEqual([
      { windowId: 'w1', windowName: 'w1', folderId: 'f1', name: 'app' },
      { windowId: 'w1', windowName: 'w1', folderId: 'f2', name: 'lib' },
      { windowId: 'w2', windowName: 'w2', folderId: null, name: 'w2' }
    ]);
  });
});

describe('labels', () => {
  const agents = [{ id: 'agent', name: 'Agent', description: null, builtin: true }];
  const models = [
    {
      id: 'copilot/gpt-5',
      vendor: 'copilot',
      family: 'gpt',
      name: 'GPT-5',
      maxInputTokens: null,
      options: []
    }
  ];

  it.each([
    [null, 'Agent'],
    ['agent', 'Agent'],
    ['file:///repo/.github/agents/My%20Reviewer.agent.md', 'My Reviewer'],
    ['plan', 'Plan']
  ])('names mode %s', (modeId, expected) => {
    expect(agentLabel(agents, modeId)).toBe(expected);
  });

  it.each([
    [null, 'Default model'],
    ['copilot/gpt-5', 'GPT-5'],
    ['gpt-5', 'GPT-5'],
    ['vendor/unknown', 'unknown']
  ])('names model %s', (modelId, expected) => {
    expect(modelLabel(models, modelId)).toBe(expected);
  });
});

describe('response parts', () => {
  it('finds the tool waiting in the latest request only', () => {
    const tool = (callId: string, awaitingConfirmation: boolean) =>
      ({
        kind: 'tool',
        callId,
        toolId: 'run',
        message: 'Run',
        detail: null,
        title: null,
        grouped: !awaitingConfirmation,
        awaitingConfirmation,
        status: 'running',
        terminal: null,
        subagent: null,
        parentCallId: null
      }) as const;
    const request = (parts: SessionDetail['requests'][number]['parts']) => ({
      id: 'r',
      timestamp: 0,
      message: 'm',
      modelId: null,
      state: 'pending' as const,
      error: null,
      parts
    });
    const detail = (requests: SessionDetail['requests']): SessionDetail => ({
      id: 's',
      title: 't',
      status: 'running',
      modelId: null,
      modeId: null,
      permission: 'default',
      editedFiles: 0,
      todos: null,
      totalRequests: requests.length,
      requests,
      queued: []
    });
    expect(pendingTool(detail([request([tool('a', false), tool('b', true)])]))?.callId).toBe('b');
    expect(pendingTool(detail([request([tool('a', true)]), request([])]))).toBeNull();
    expect(pendingTool(null)).toBeNull();
  });
});

describe('routing', () => {
  it.each([
    ['', { name: 'chats' }],
    ['#/settings', { name: 'settings' }],
    ['#/new', { name: 'new' }],
    ['#/windows', { name: 'windows' }],
    ['#/open', { name: 'open' }],
    ['#/code', { name: 'code' }],
    ['#/terminals', { name: 'terminals' }],
    ['#/terminal/w/t', { name: 'terminal', windowId: 'w', terminalId: 't', executionId: null }],
    ['#/terminal/w', { name: 'chats' }],
    ['#/session/w%2F1/s%201', { name: 'session', windowId: 'w/1', sessionId: 's 1' }],
    ['#/session/w1', { name: 'chats' }],
    ['#/tree/w/f', { name: 'folder', windowId: 'w', folderId: 'f', tab: 'files', path: '' }],
    ['#/changes/w/f', { name: 'folder', windowId: 'w', folderId: 'f', tab: 'changes', path: '' }]
  ])('parses %s', (hash, route) => {
    expect(parseRoute(hash)).toEqual(route);
  });

  it.each<Route>([
    { name: 'session', windowId: 'w/1', sessionId: 'a#b' },
    { name: 'folder', windowId: 'w', folderId: 'f', tab: 'files', path: 'src/a b/c#d' },
    { name: 'folder', windowId: 'w', folderId: 'f', tab: 'changes', path: '' },
    { name: 'file', windowId: 'w', folderId: 'f', path: 'src/%20.ts' },
    { name: 'gitDiff', windowId: 'w', folderId: 'f', path: 'a/b.ts' },
    { name: 'sessionChanges', windowId: 'w', sessionId: 's', requestId: null },
    { name: 'sessionChanges', windowId: 'w', sessionId: 's', requestId: 'r/1' },
    {
      name: 'sessionDiff',
      windowId: 'w',
      sessionId: 's',
      path: '/Users/me/a/b.ts',
      requestId: null
    },
    { name: 'sessionDiff', windowId: 'w', sessionId: 's', path: '/a b.ts', requestId: 'r1' },
    { name: 'terminal', windowId: 'w/1', terminalId: 't 1', executionId: null },
    { name: 'terminal', windowId: 'w', terminalId: 't', executionId: 'e#1' }
  ])('round-trips $name routes', (route) => {
    expect(parseRoute(routeHash(route))).toEqual(route);
  });

  it.each<[Route, boolean]>([
    [{ name: 'session', windowId: 'w', sessionId: 's' }, true],
    [{ name: 'sessionChanges', windowId: 'w', sessionId: 's', requestId: 'r1' }, true],
    [{ name: 'sessionDiff', windowId: 'w', sessionId: 's', path: 'a.ts', requestId: null }, true],
    [
      {
        name: 'editDiff',
        windowId: 'w',
        sessionId: 's',
        requestId: 'r1',
        path: 'a.ts',
        stopId: null,
        callId: null
      },
      true
    ],
    [{ name: 'sessionChanges', windowId: 'w', sessionId: 'other', requestId: null }, false],
    [{ name: 'session', windowId: 'other', sessionId: 's' }, false],
    [{ name: 'chats' }, false],
    [{ name: 'terminal', windowId: 'w', terminalId: 's', executionId: null }, false]
  ])('keeps %o inside chat w/s: %s', (route, expected) => {
    expect(inChat(route, 'w', 's')).toBe(expected);
  });

  it.each([
    ['#pair=123456', '123456'],
    ['#pair=12345', null],
    ['#/code', null]
  ])('reads pairing code from %s', (hash, code) => {
    expect(pairCode(hash)).toBe(code);
  });
});
