import {
  type Model,
  type PullRequestState,
  SEGMENT_BOLD,
  type SessionDetail,
  type TerminalColor,
  type TerminalDetail,
  type TerminalLine,
  type TerminalSummary,
  type WindowState
} from '@pocket-pilot/protocol';

export interface MockTerminal {
  summary: TerminalSummary;
  detail: TerminalDetail;
}

export interface MockWindow {
  state: WindowState;
  details: Map<string, SessionDetail>;
  terminals: Map<string, TerminalDetail>;
}

const MINUTE = 60_000;
const RED = 1;
export const GREEN = 2;

const AGENTS: WindowState['agents'] = [
  { id: 'agent', name: 'Agent', description: 'Edits files and runs tools', builtin: true },
  {
    id: 'file:///repo/.github/agents/reviewer.agent.md',
    name: 'Reviewer',
    description: 'Reviews changes',
    builtin: false
  }
];

function models(): Model[] {
  return [
    {
      id: 'copilot/claude-opus',
      vendor: 'copilot',
      family: 'claude-opus',
      name: 'Claude Opus',
      maxInputTokens: 200_000,
      options: [
        {
          key: 'reasoningEffort',
          title: 'Thinking effort',
          choices: [
            { value: 'low', label: 'Low', description: null },
            { value: 'medium', label: 'Medium', description: null },
            { value: 'high', label: 'High', description: null }
          ],
          defaultValue: 'medium',
          value: null
        },
        {
          key: 'contextSize',
          title: 'Context size',
          choices: [
            { value: 200_000, label: '200K', description: null },
            { value: 1_000_000, label: '1M', description: null }
          ],
          defaultValue: 200_000,
          value: null
        }
      ]
    },
    {
      id: 'copilot/gpt-5',
      vendor: 'copilot',
      family: 'gpt-5',
      name: 'GPT-5',
      maxInputTokens: 128_000,
      options: []
    }
  ];
}

function summaryOf(detail: SessionDetail, updatedAt: number): WindowState['sessions'][number] {
  const last = detail.requests.at(-1);
  return {
    id: detail.id,
    title: detail.title,
    createdAt: detail.requests[0]?.timestamp ?? updatedAt,
    updatedAt,
    status: detail.status,
    lastRequestState: last?.state ?? null,
    modelId: detail.modelId,
    modeId: detail.modeId,
    requestCount: detail.totalRequests,
    preview: last?.message ?? null,
    pinned: false,
    archived: false
  };
}

export function refreshSummary(window: MockWindow, sessionId: string, now: number): void {
  const detail = window.details.get(sessionId);
  if (!detail) return;
  const index = window.state.sessions.findIndex((session) => session.id === sessionId);
  const existing = window.state.sessions[index];
  const summary = {
    ...summaryOf(detail, now),
    pinned: existing?.pinned ?? false,
    archived: existing?.archived ?? false
  };
  if (index === -1) window.state.sessions.unshift(summary);
  else window.state.sessions[index] = summary;
}

export function line(text: string, fg: TerminalColor = null, flags = 0): TerminalLine {
  return [{ text, fg, bg: null, flags }];
}

export function newTerminal(
  id: string,
  cwd: string | null,
  fields: Partial<TerminalSummary> = {}
): MockTerminal {
  return {
    summary: {
      id,
      name: 'zsh',
      cwd,
      shell: 'zsh',
      agent: false,
      sessionId: null,
      command: null,
      lastExitCode: null,
      owned: false,
      exited: false,
      ...fields
    },
    detail: { id, dropped: 0, executions: [], stream: null }
  };
}

export function ownedTerminal(id: string, cwd: string | null): MockTerminal {
  const terminal = newTerminal(id, cwd, { owned: true });
  terminal.detail.stream = {
    dropped: 0,
    lines: [],
    tail: [line(`${cwd ?? '~'} $`)],
    alternate: false
  };
  return terminal;
}

function terminals(now: number): MockTerminal[] {
  const user = newTerminal('t-user', '~/Git/vscode-pocket-pilot', { lastExitCode: 1 });
  const execution = {
    cwd: user.summary.cwd,
    sessionId: null,
    callId: null,
    alternate: false,
    dropped: 0,
    tail: []
  };
  user.detail.executions.push(
    {
      ...execution,
      id: 'e-status',
      command: 'git status',
      startedAt: now - 6 * MINUTE,
      endedAt: now - 6 * MINUTE,
      exitCode: 0,
      lines: [
        [
          { text: 'On branch ', fg: null, bg: null, flags: 0 },
          { text: 'main', fg: null, bg: null, flags: SEGMENT_BOLD }
        ],
        line('Changes not staged for commit:'),
        line('\tmodified:   packages/web/src/lib/routing.ts', RED)
      ]
    },
    {
      ...execution,
      id: 'e-lint',
      command: 'npm run lint',
      startedAt: now - 5 * MINUTE,
      endedAt: now - 5 * MINUTE,
      exitCode: 1,
      lines: [line('src/App.svelte'), line('✖ 1 problem (1 error, 0 warnings)', RED, SEGMENT_BOLD)]
    }
  );
  const agent = newTerminal('t-agent', '~/Git/vscode-pocket-pilot', {
    name: 'Copilot',
    agent: true,
    sessionId: 's1'
  });
  const plain = newTerminal('t-plain', '~/Git/vscode-pocket-pilot', {
    name: 'bash',
    shell: 'bash'
  });
  return [user, agent, plain];
}

function buildWindow(
  state: Omit<WindowState, 'sessions' | 'terminals'>,
  details: SessionDetail[],
  now: number,
  archived: readonly string[] = [],
  shells: MockTerminal[] = []
): MockWindow {
  const window: MockWindow = {
    state: { ...state, sessions: [], terminals: shells.map(({ summary }) => summary) },
    details: new Map(),
    terminals: new Map(shells.map(({ detail }) => [detail.id, detail]))
  };
  details.forEach((detail, index) => {
    window.details.set(detail.id, detail);
    window.state.sessions.push({
      ...summaryOf(detail, now - index * 25 * MINUTE),
      archived: archived.includes(detail.id)
    });
  });
  return window;
}

export function initialWindows(now: number): MockWindow[] {
  return [
    buildWindow(
      {
        windowId: 'w1',
        name: 'vscode-pocket-pilot',
        repositories: [
          {
            key: 'github.com/haavardnk/vscode-pocket-pilot',
            label: 'vscode-pocket-pilot',
            github: { owner: 'haavardnk', name: 'vscode-pocket-pilot' }
          }
        ],
        agents: AGENTS,
        models: models(),
        folders: [{ id: 'f1', name: 'vscode-pocket-pilot' }],
        canOrganize: true
      },
      [
        {
          id: 's1',
          title: 'Build the phone app',
          status: 'running',
          modelId: 'copilot/claude-opus',
          modeId: 'agent',
          permission: 'default',
          editedFiles: 2,
          totalRequests: 1,
          requests: [
            {
              id: 'r1',
              timestamp: now - 3 * MINUTE,
              message: 'Build the phone app with a session list and composer.',
              modelId: 'copilot/claude-opus',
              state: 'pending',
              error: null,
              parts: [
                { kind: 'thinking', text: 'Plan the screens first.', title: 'Planning' },
                {
                  kind: 'markdown',
                  text: 'Starting with the **session list**.\n\n```ts\nconst sessions = [];\n```'
                },
                {
                  kind: 'tool',
                  callId: 'c0',
                  toolId: 'read_file',
                  message: 'Read `App.svelte`',
                  detail: null,
                  title: 'Updated the app shell',
                  grouped: true,
                  awaitingConfirmation: false,
                  status: 'done',
                  terminal: null
                },
                {
                  kind: 'edit',
                  path: '/repo/packages/web/src/App.svelte',
                  stopId: 'u1',
                  callId: 'c-edit',
                  additions: 1,
                  deletions: 0
                },
                {
                  kind: 'tool',
                  callId: 'c1',
                  toolId: 'run_in_terminal',
                  message: 'Run `npm test`',
                  detail: 'npm test -- --run',
                  title: null,
                  grouped: false,
                  awaitingConfirmation: true,
                  status: 'running',
                  terminal: null
                }
              ]
            }
          ],
          queued: []
        },
        {
          id: 's2',
          title: 'Fix flaky cluster test',
          status: 'idle',
          modelId: 'copilot/gpt-5',
          modeId: 'file:///repo/.github/agents/reviewer.agent.md',
          permission: 'default',
          editedFiles: 0,
          totalRequests: 1,
          requests: [
            {
              id: 'r2',
              timestamp: now - 30 * MINUTE,
              message: 'Why does the cluster test time out?',
              modelId: 'copilot/gpt-5',
              state: 'complete',
              error: null,
              parts: [
                { kind: 'markdown', text: 'The follower retried before the leader was listening.' }
              ]
            }
          ],
          queued: []
        },
        {
          id: 's4',
          title: 'Plan the release',
          status: 'needsInput',
          modelId: 'copilot/claude-opus',
          modeId: 'agent',
          permission: 'autoApprove',
          editedFiles: 0,
          totalRequests: 1,
          requests: [
            {
              id: 'r4',
              timestamp: now - 10 * MINUTE,
              message: 'Plan the 0.2 release.',
              modelId: 'copilot/claude-opus',
              state: 'needsInput',
              error: null,
              parts: [
                { kind: 'markdown', text: 'A few choices before I start.' },
                {
                  kind: 'questions',
                  resolveId: 'carousel-1',
                  allowSkip: true,
                  state: 'pending',
                  questions: [
                    {
                      id: 'channel',
                      type: 'singleSelect',
                      title: 'Release channel',
                      message: 'Where should the build go?',
                      options: [
                        { id: 'stable', label: 'Stable', value: 'stable' },
                        { id: 'preview', label: 'Preview', value: 'preview' }
                      ],
                      defaultValue: 'stable',
                      allowFreeformInput: false,
                      required: true
                    },
                    {
                      id: 'targets',
                      type: 'multiSelect',
                      title: 'Platforms',
                      message: null,
                      options: [
                        { id: 'mac', label: 'macOS', value: 'mac' },
                        { id: 'linux', label: 'Linux', value: 'linux' }
                      ],
                      defaultValue: null,
                      allowFreeformInput: true,
                      required: false
                    },
                    {
                      id: 'notes',
                      type: 'text',
                      title: 'Release notes',
                      message: null,
                      options: [],
                      defaultValue: null,
                      allowFreeformInput: true,
                      required: false
                    }
                  ],
                  answers: null
                }
              ]
            }
          ],
          queued: [
            { id: 'q1', delivery: 'steering', text: 'Keep the changelog short', attachments: 0 },
            { id: 'q2', delivery: 'queued', text: 'Draft the announcement', attachments: 2 },
            { id: 'q3', delivery: 'queued', text: 'Tag the release', attachments: 0 }
          ]
        },
        {
          id: 's5',
          title: 'Bump dependencies',
          status: 'idle',
          modelId: 'copilot/gpt-5',
          modeId: 'agent',
          permission: 'default',
          editedFiles: 0,
          totalRequests: 1,
          requests: [
            {
              id: 'r5',
              timestamp: now - 80 * MINUTE,
              message: 'Bump the web dependencies.',
              modelId: 'copilot/gpt-5',
              state: 'complete',
              error: null,
              parts: [{ kind: 'markdown', text: 'Bumped Svelte and Vite.' }]
            }
          ],
          queued: []
        }
      ],
      now,
      ['s5'],
      terminals(now)
    ),
    buildWindow(
      {
        windowId: 'w2',
        name: 'immich-edit',
        repositories: [
          {
            key: 'github.com/haavardnk/immich-edit',
            label: 'immich-edit',
            github: { owner: 'haavardnk', name: 'immich-edit' }
          }
        ],
        agents: AGENTS,
        models: models(),
        folders: [{ id: 'f2', name: 'immich-edit' }],
        canOrganize: true
      },
      [
        {
          id: 's3',
          title: 'Tune the RAW pipeline',
          status: 'idle',
          modelId: 'copilot/claude-opus',
          modeId: 'agent',
          permission: 'default',
          editedFiles: 0,
          totalRequests: 1,
          requests: [
            {
              id: 'r3',
              timestamp: now - 60 * MINUTE,
              message: 'Speed up demosaic.',
              modelId: 'copilot/claude-opus',
              state: 'complete',
              error: null,
              parts: [
                { kind: 'markdown', text: 'Demosaic is now 2x faster.' },
                {
                  kind: 'confirmation',
                  title: 'Continue to iterate?',
                  message: 'Copilot has been working on this problem for a while.',
                  buttons: ['Continue', 'Pause'],
                  state: 'pending'
                }
              ]
            }
          ],
          queued: []
        }
      ],
      now - 40 * MINUTE
    )
  ];
}

export function initialPullRequests(now: number): PullRequestState {
  return {
    status: 'ready',
    fetchedAt: now - MINUTE,
    errors: [],
    pullRequests: [
      {
        repositoryKey: 'github.com/haavardnk/vscode-pocket-pilot',
        number: 12,
        title: 'feat: add phone app',
        url: 'https://github.com/haavardnk/vscode-pocket-pilot/pull/12',
        author: 'haavardnk',
        isDraft: false,
        headRef: 'feat/web',
        baseRef: 'main',
        updatedAt: new Date(now - 5 * MINUTE).toISOString(),
        checks: 'success',
        review: 'approved',
        mergeable: 'mergeable',
        additions: 1200,
        deletions: 40
      },
      {
        repositoryKey: 'github.com/haavardnk/vscode-pocket-pilot',
        number: 11,
        title: 'fix: follower reconnect',
        url: 'https://github.com/haavardnk/vscode-pocket-pilot/pull/11',
        author: 'haavardnk',
        isDraft: true,
        headRef: 'fix/reconnect',
        baseRef: 'main',
        updatedAt: new Date(now - 90 * MINUTE).toISOString(),
        checks: 'failure',
        review: 'none',
        mergeable: 'conflicting',
        additions: 30,
        deletions: 12
      },
      {
        repositoryKey: 'github.com/haavardnk/immich-edit',
        number: 88,
        title: 'perf: faster demosaic',
        url: 'https://github.com/haavardnk/immich-edit/pull/88',
        author: 'haavardnk',
        isDraft: false,
        headRef: 'perf/demosaic',
        baseRef: 'main',
        updatedAt: new Date(now - 20 * MINUTE).toISOString(),
        checks: 'pending',
        review: 'reviewRequired',
        mergeable: 'mergeable',
        additions: 210,
        deletions: 180
      }
    ]
  };
}
