import {
  type CopilotUsage,
  type ImageResult,
  type Model,
  type OpenTarget,
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
const SAMPLE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

export function samplePhotos(): Map<string, ImageResult> {
  return new Map([['r2/shot', { kind: 'requestImage', mimeType: 'image/png', data: SAMPLE_PNG }]]);
}

const PLAN_AGENT =
  'vscode-userdata:/User/globalStorage/github.copilot-chat/plan-agent/Plan.agent.md';

const AGENTS: WindowState['agents'] = [
  {
    id: 'agent',
    name: 'Agent',
    description: 'Edits files and runs tools',
    builtin: true,
    handoffs: []
  },
  {
    id: PLAN_AGENT,
    name: 'Plan',
    description: 'Researches and outlines multi-step plans',
    builtin: true,
    handoffs: [
      {
        id: 'agent:start-implementation',
        label: 'Start Implementation',
        agent: 'agent',
        prompt: 'Start implementation',
        send: true
      },
      {
        id: 'Plan:refine-the-plan',
        label: 'Refine the Plan',
        agent: 'Plan',
        prompt: 'Refine the plan: ',
        send: false
      }
    ]
  },
  {
    id: 'file:///repo/.github/agents/reviewer.agent.md',
    name: 'Reviewer',
    description: 'Reviews changes',
    builtin: false,
    handoffs: []
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
      vision: true,
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
      vision: false,
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

function newTerminal(
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

function target(name: string, kind: OpenTarget['kind'] = 'folder'): OpenTarget {
  const file = kind === 'workspace' ? `${name}.code-workspace` : name;
  return { id: `file:///Users/me/Git/${file}`, name, path: `~/Git/${file}`, kind };
}

export const OPEN_TARGETS = {
  recent: [
    target('vscode-pocket-pilot'),
    target('immich-edit'),
    target('photo-tools'),
    target('home-lab', 'workspace')
  ],
  projects: [target('dotfiles'), target('raw-pipeline')]
};

export function openedWindow(windowId: string, opened: OpenTarget): MockWindow {
  const key = `github.com/haavardnk/${opened.name}`;
  return buildWindow(
    {
      windowId,
      name: opened.name,
      workspace: opened.id,
      repositories: [
        { key, label: opened.name, github: { owner: 'haavardnk', name: opened.name } }
      ],
      agents: AGENTS,
      models: models(),
      folders: [{ id: `${windowId}-f`, name: opened.name, repositoryKey: key, git: null }],
      canOrganize: true
    },
    [],
    Date.now()
  );
}

export function copilotUsage(now: number): CopilotUsage {
  const date = new Date(now);
  return {
    state: 'ready',
    plan: 'Pro+',
    meters: [
      { kind: 'premium', usedPercent: 42, used: 630, total: 1500, unlimited: false },
      { kind: 'chat', usedPercent: 0, used: null, total: null, unlimited: true },
      { kind: 'completions', usedPercent: 0, used: null, total: null, unlimited: true }
    ],
    overage: { permitted: true, count: 0 },
    resetAt: Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1),
    checkedAt: now - 3 * MINUTE
  };
}

export function initialWindows(now: number): MockWindow[] {
  return [
    buildWindow(
      {
        windowId: 'w1',
        name: 'vscode-pocket-pilot',
        workspace: 'file:///Users/me/Git/vscode-pocket-pilot',
        repositories: [
          {
            key: 'github.com/haavardnk/vscode-pocket-pilot',
            label: 'vscode-pocket-pilot',
            github: { owner: 'haavardnk', name: 'vscode-pocket-pilot' }
          }
        ],
        agents: AGENTS,
        models: models(),
        folders: [
          {
            id: 'f1',
            name: 'vscode-pocket-pilot',
            repositoryKey: 'github.com/haavardnk/vscode-pocket-pilot',
            git: {
              branch: 'feat/web',
              commit: '4f2c9e1a7b3d5f60812c4e9a0b1d2c3e4f5a6b7c',
              upstream: { remote: 'origin', branch: 'feat/web', ahead: 2, behind: 1 },
              changed: 3
            }
          }
        ],
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
          todos: [
            { title: 'Session list', status: 'completed' },
            { title: 'Composer with queue', status: 'inProgress' },
            { title: 'Offline banner', status: 'notStarted' }
          ],
          totalRequests: 1,
          requests: [
            {
              id: 'r1',
              timestamp: now - 3 * MINUTE,
              message: 'Build the phone app with a session list and composer.',
              modelId: 'copilot/claude-opus',
              agentName: null,
              state: 'pending',
              error: null,
              editable: true,
              disabled: false,
              editedPaths: ['/repo/packages/web/src/App.svelte'],
              images: [],
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
                  terminal: null,
                  subagent: null,
                  parentCallId: null
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
                  terminal: null,
                  subagent: null,
                  parentCallId: null
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
          todos: null,
          totalRequests: 1,
          requests: [
            {
              id: 'r2',
              timestamp: now - 30 * MINUTE,
              message: 'Why does the cluster test time out?',
              modelId: 'copilot/gpt-5',
              agentName: 'Reviewer',
              state: 'complete',
              error: null,
              editable: true,
              disabled: false,
              editedPaths: [],
              images: [{ id: 'shot', name: 'Pasted Image', mimeType: 'image/png' }],
              parts: [
                {
                  kind: 'tool',
                  callId: 'sub1',
                  toolId: 'runSubagent',
                  message: 'Find the election timeout',
                  detail: null,
                  title: null,
                  grouped: false,
                  awaitingConfirmation: false,
                  status: 'done',
                  terminal: null,
                  subagent: {
                    agentName: 'Explore',
                    description: 'Find the election timeout',
                    model: 'Claude Haiku 4.5',
                    result: 'The follower connects **before** the leader listens.'
                  },
                  parentCallId: null
                },
                {
                  kind: 'tool',
                  callId: 'sub1-read',
                  toolId: 'read_file',
                  message: 'Read `cluster.ts`',
                  detail: null,
                  title: null,
                  grouped: false,
                  awaitingConfirmation: false,
                  status: 'done',
                  terminal: null,
                  subagent: null,
                  parentCallId: 'sub1'
                },
                {
                  kind: 'markdown',
                  text: 'The follower retried before the leader was listening. Regressed in 3b7d0a2, fixed in `4f2c9e1`, see #12.'
                }
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
          todos: null,
          totalRequests: 1,
          requests: [
            {
              id: 'r4',
              timestamp: now - 10 * MINUTE,
              message: 'Plan the 0.2 release.',
              modelId: 'copilot/claude-opus',
              agentName: null,
              state: 'needsInput',
              error: null,
              editable: true,
              disabled: false,
              editedPaths: [],
              images: [],
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
          id: 's6',
          title: 'Plan offline mode',
          status: 'idle',
          modelId: 'copilot/claude-opus',
          modeId: PLAN_AGENT,
          permission: 'default',
          editedFiles: 0,
          todos: null,
          totalRequests: 1,
          requests: [
            {
              id: 'r6',
              timestamp: now - 45 * MINUTE,
              message: 'Plan offline mode for the phone app.',
              modelId: 'copilot/claude-opus',
              agentName: 'Plan',
              state: 'complete',
              error: null,
              editable: true,
              disabled: false,
              editedPaths: [],
              images: [],
              parts: [
                {
                  kind: 'markdown',
                  text: '## Plan: Offline mode\n\n1. Cache the last snapshot.\n2. Queue commands while offline.'
                }
              ]
            }
          ],
          queued: []
        },
        {
          id: 's5',
          title: 'Bump dependencies',
          status: 'idle',
          modelId: 'copilot/gpt-5',
          modeId: 'agent',
          permission: 'default',
          editedFiles: 0,
          todos: null,
          totalRequests: 1,
          requests: [
            {
              id: 'r5',
              timestamp: now - 80 * MINUTE,
              message: 'Bump the web dependencies.',
              modelId: 'copilot/gpt-5',
              agentName: null,
              state: 'complete',
              error: null,
              editable: true,
              disabled: false,
              editedPaths: [],
              images: [],
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
        workspace: 'file:///Users/me/Git/immich-edit',
        repositories: [
          {
            key: 'github.com/haavardnk/immich-edit',
            label: 'immich-edit',
            github: { owner: 'haavardnk', name: 'immich-edit' }
          }
        ],
        agents: AGENTS,
        models: models(),
        folders: [
          {
            id: 'f2',
            name: 'immich-edit',
            repositoryKey: 'github.com/haavardnk/immich-edit',
            git: {
              branch: null,
              commit: '9c1e5d7f3a2b4c6d8e0f1a2b3c4d5e6f7a8b9c0d',
              upstream: null,
              changed: 0
            }
          }
        ],
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
          todos: null,
          totalRequests: 1,
          requests: [
            {
              id: 'r3',
              timestamp: now - 60 * MINUTE,
              message: 'Speed up demosaic.',
              modelId: 'copilot/claude-opus',
              agentName: null,
              state: 'complete',
              error: null,
              editable: true,
              disabled: false,
              editedPaths: [],
              images: [],
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
        },
        {
          id: 's7',
          title: 'Split the exporter',
          status: 'idle',
          modelId: 'copilot/claude-opus',
          modeId: 'agent',
          permission: 'default',
          editedFiles: 2,
          todos: null,
          totalRequests: 3,
          requests: [
            {
              id: 'r7a',
              timestamp: now - 70 * MINUTE,
              message: 'Extract the JPEG encoder.',
              modelId: 'copilot/claude-opus',
              agentName: null,
              state: 'complete',
              error: null,
              editable: true,
              disabled: false,
              editedPaths: ['/Users/me/Git/immich-edit/src/export/jpeg.rs'],
              images: [],
              parts: [
                {
                  kind: 'edit',
                  path: '/Users/me/Git/immich-edit/src/export/jpeg.rs',
                  stopId: 'u7a',
                  callId: 'c7a',
                  additions: 40,
                  deletions: 2
                },
                { kind: 'markdown', text: 'Moved the JPEG encoder into its own module.' }
              ]
            },
            {
              id: 'r7b',
              timestamp: now - 68 * MINUTE,
              message: 'Add a PNG encoder next to it.',
              modelId: 'copilot/gpt-5',
              agentName: null,
              state: 'complete',
              error: null,
              editable: true,
              disabled: false,
              editedPaths: ['/Users/me/Git/immich-edit/src/export/png.rs'],
              images: [],
              parts: [
                {
                  kind: 'edit',
                  path: '/Users/me/Git/immich-edit/src/export/png.rs',
                  stopId: 'u7b',
                  callId: 'c7b',
                  additions: 35,
                  deletions: 0
                },
                { kind: 'markdown', text: 'Added a PNG encoder.' }
              ]
            },
            {
              id: 'r7c',
              timestamp: now - 66 * MINUTE,
              message: 'Summarise the export modules.',
              modelId: 'copilot/claude-opus',
              agentName: null,
              state: 'complete',
              error: null,
              editable: true,
              disabled: false,
              editedPaths: [],
              images: [],
              parts: [{ kind: 'markdown', text: 'There are two encoders now.' }]
            }
          ],
          queued: []
        }
      ],
      now - 40 * MINUTE
    )
  ];
}
