import type { Model, PullRequestState, SessionDetail, WindowState } from '@pocket-pilot/protocol';

export interface MockWindow {
  state: WindowState;
  details: Map<string, SessionDetail>;
}

const MINUTE = 60_000;

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
    preview: last?.message ?? null
  };
}

export function refreshSummary(window: MockWindow, sessionId: string, now: number): void {
  const detail = window.details.get(sessionId);
  if (!detail) return;
  const summary = summaryOf(detail, now);
  const index = window.state.sessions.findIndex((session) => session.id === sessionId);
  if (index === -1) window.state.sessions.unshift(summary);
  else window.state.sessions[index] = summary;
}

function buildWindow(
  state: Omit<WindowState, 'sessions'>,
  details: SessionDetail[],
  now: number
): MockWindow {
  const window: MockWindow = { state: { ...state, sessions: [] }, details: new Map() };
  details.forEach((detail, index) => {
    window.details.set(detail.id, detail);
    window.state.sessions.push(summaryOf(detail, now - index * 25 * MINUTE));
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
        folders: [{ id: 'f1', name: 'vscode-pocket-pilot' }]
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
                { kind: 'edit', path: '/repo/packages/web/src/App.svelte' },
                {
                  kind: 'tool',
                  callId: 'c1',
                  toolId: 'run_in_terminal',
                  message: 'Run `npm test`',
                  detail: 'npm test -- --run',
                  awaitingConfirmation: true
                }
              ]
            }
          ],
          queued: [],
          live: [
            {
              kind: 'tool',
              at: now - 2 * MINUTE,
              callId: 'c0',
              name: 'read_file',
              state: 'succeeded'
            },
            {
              kind: 'tool',
              at: now - MINUTE,
              callId: 'c1',
              name: 'run_in_terminal',
              state: 'running'
            }
          ]
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
          queued: [],
          live: []
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
          queued: [],
          live: []
        }
      ],
      now
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
        folders: [{ id: 'f2', name: 'immich-edit' }]
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
          queued: [],
          live: []
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
