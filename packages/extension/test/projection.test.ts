import { describe, expect, it } from 'vitest';

import type { Activity } from '../src/sessions/activityParts';
import { plainMessage } from '../src/sessions/partText';
import { editedPaths, projectDetail, projectSummary } from '../src/sessions/projection';
import { request, SESSION_ID, snapshot } from './fixtures';

const quiet: Activity = { statuses: new Map(), events: [], toolsOnly: false, settled: false };
const block = { kind: 'codeblockUri', uri: { path: '/repo/a.ts' }, isEdit: true };
const group = { kind: 'textEditGroup', uri: { path: '/repo/a.ts' } };
const edit = {
  kind: 'edit',
  path: '/repo/a.ts',
  stopId: null,
  callId: null,
  additions: null,
  deletions: null
};

describe('projection', () => {
  it.each([
    [[], 'idle'],
    [[request('r1', 'go', 1)], 'idle'],
    [[request('r1', 'go', 0)], 'running'],
    [[request('r1', 'go', 4)], 'needsInput'],
    [[request('r1', 'go', 3)], 'failed'],
    [[request('r1', 'go', 3), request('r2', 'again', 2)], 'idle']
  ])('derives status %#', (requests, expected) => {
    expect(projectSummary(snapshot(requests), 'file', 5).status).toBe(expected);
  });

  it('summarizes title, model, mode and preview', () => {
    const root = snapshot([
      request('r1', 'Fix   the\nlogin flow', 1),
      request('r2', 'Also tests', 1)
    ]);
    expect(projectSummary(root, SESSION_ID, 1_800_000_000_000)).toEqual({
      id: SESSION_ID,
      title: 'Fix the login flow',
      createdAt: 1_699_999_000_000,
      updatedAt: 1_800_000_000_000,
      status: 'idle',
      lastRequestState: 'complete',
      modelId: 'copilot/gpt-5',
      modeId: 'file:///Users/dev/.github/agents/Reviewer.agent.md',
      requestCount: 2,
      preview: 'Also tests'
    });
  });

  it('prefers the custom title', () => {
    const root = snapshot([request('r1', 'x', 1)], { customTitle: 'Named' });
    expect(projectSummary(root, 'file', 0).title).toBe('Named');
  });

  it.each([
    ['Read [](file:///repo/src/app.ts), lines 1 to 5', 'Read app.ts, lines 1 to 5'],
    ['Read [](file:///repo/TODO.md#33-33), lines 33 to 44', 'Read TODO.md, lines 33 to 44'],
    ['Opened [Browser](vscode-browser:/id?vscodeLinkType=browser)', 'Opened Browser']
  ])('cleans tool message %s', (value, expected) => {
    expect(plainMessage({ value })).toBe(expected);
  });

  it.each([
    [{ path: '/repo/a.ts' }, 'Open `a.ts`'],
    [
      { name: 'devices.json', kind: 12, location: { uri: { path: '/x/y' } } },
      'Open `devices.json`'
    ],
    [
      { uri: { path: '/repo/a.ts' }, range: { startLineNumber: 3, endLineNumber: 3 } },
      'Open `a.ts:3`'
    ],
    [
      { uri: { path: '/repo/a.ts' }, range: { startLineNumber: 3, endLineNumber: 9 } },
      'Open `a.ts:3-9`'
    ],
    [{}, 'Open ']
  ])('labels inline references like VS Code %#', (inlineReference, text) => {
    const response = [{ value: 'Open ' }, { kind: 'inlineReference', inlineReference }];
    const root = snapshot([request('r1', 'go', 1, response)]);
    const detail = projectDetail(root, projectSummary(root, 'file', 0), 1, quiet, []);
    expect(detail.requests[0]?.parts).toEqual([{ kind: 'markdown', text }]);
  });

  it('projects parts, queue and activity', () => {
    const response = [
      { value: 'Looking at ' },
      { kind: 'inlineReference', inlineReference: { path: '/repo/a.ts' } },
      { value: ' now.' },
      { kind: 'thinking', value: ['Consider', ' this'], generatedTitle: 'Plan' },
      {
        kind: 'toolInvocationSerialized',
        toolCallId: 'c1',
        toolId: 'run_in_terminal',
        invocationMessage: { value: 'Run tests' },
        toolSpecificData: { kind: 'terminal', commandLine: { original: ' npm test ' } },
        isConfirmed: null,
        isComplete: true
      },
      { kind: 'textEditGroup', uri: { path: '/repo/a.ts' } },
      { kind: 'textEditGroup', uri: { fsPath: '/repo/a.ts', path: '/repo/a.ts' } },
      { kind: 'undoStop' }
    ];
    const root = snapshot([request('r0', 'old', 1), request('r1', 'go', 4, response)], {
      pendingRequests: [
        {
          id: 'q1',
          kind: 'steering',
          request: {
            message: { text: 'faster #file:a.ts' },
            variableData: {
              variables: [
                { id: 'vscode.implicit.file', kind: 'file' },
                { id: 'i', kind: 'implicit' },
                { id: 'rules', kind: 'promptFile', automaticallyAdded: true },
                { id: 'owner/repo', kind: 'workspace' },
                { id: 'ref', kind: 'file', range: { start: 7, endExclusive: 17 } },
                { id: 'shot', kind: 'image' }
              ]
            }
          }
        }
      ]
    });
    const activity: Activity = {
      statuses: new Map([['c1', 'running']]),
      events: [
        { type: 'message', at: 1, text: 'All green', reasoning: 'Check first' },
        { type: 'toolStart', at: 2, callId: 'c1', name: 'run_in_terminal', args: null },
        { type: 'toolStart', at: 3, callId: 'c2', name: 'grep_search', args: '{"query":"x"}' },
        { type: 'message', at: 4, text: 'hidden while a tool runs', reasoning: null }
      ],
      toolsOnly: false,
      settled: false
    };
    const detail = projectDetail(root, projectSummary(root, 'file', 0), 1, activity, []);
    expect(detail.totalRequests).toBe(2);
    expect(detail.queued).toEqual([
      { id: 'q1', delivery: 'steering', text: 'faster #file:a.ts', attachments: 1 }
    ]);
    expect(detail.requests).toHaveLength(1);
    expect(detail.requests[0]?.parts).toEqual([
      { kind: 'markdown', text: 'Looking at `a.ts` now.' },
      { kind: 'thinking', text: 'Consider this', title: 'Plan' },
      {
        kind: 'tool',
        callId: 'c1',
        toolId: 'run_in_terminal',
        message: 'Running `npm test`',
        detail: 'npm test',
        title: null,
        grouped: false,
        awaitingConfirmation: true,
        status: 'running',
        terminal: null,
        subagent: null,
        parentCallId: null
      },
      edit,
      { kind: 'thinking', text: 'Check first', title: null },
      { kind: 'markdown', text: 'All green' },
      {
        kind: 'tool',
        callId: 'c2',
        toolId: 'grep_search',
        message: 'Searching for text `x`',
        detail: '{"query":"x"}',
        title: null,
        grouped: true,
        awaitingConfirmation: false,
        status: 'running',
        terminal: null,
        subagent: null,
        parentCallId: null
      }
    ]);
    expect(detail.permission).toBe('default');
  });

  it.each([
    [[{ value: '\n```\n' }, { kind: 'undoStop' }, block, group, { value: '\n```\n' }], [edit]],
    [
      [{ value: 'Editing:\n```ts\n' }, block, group, { value: '\n```\nDone.' }],
      [{ kind: 'markdown', text: 'Editing:' }, edit, { kind: 'markdown', text: 'Done.' }]
    ],
    [
      [{ value: '```ts\nx\n```\n\n```\n' }, block, group, { value: '\n```\n' }],
      [{ kind: 'markdown', text: '```ts\nx\n```' }, edit]
    ],
    [
      [
        { value: '\n```\n' },
        block,
        group,
        { value: '\n```\n\n```\n' },
        { kind: 'undoStop' },
        { ...block, uri: { path: '/repo/b.ts' } },
        { ...group, uri: { path: '/repo/b.ts' } },
        { value: '\n```\n' }
      ],
      [edit, { ...edit, path: '/repo/b.ts' }]
    ]
  ])('drops the code fences around an edit %#', (response, expected) => {
    const root = snapshot([request('r1', 'go', 1, response)]);
    const detail = projectDetail(root, projectSummary(root, 'file', 0), 1, quiet, []);
    expect(detail.requests[0]?.parts).toEqual(expected);
  });

  it('anchors each edit to its undo stop and tool call', () => {
    const call = (id: string) => ({
      kind: 'toolInvocationSerialized',
      toolCallId: id,
      toolId: 'copilot_replaceString',
      invocationMessage: { value: 'Edit' },
      presentation: 'hidden',
      isComplete: true
    });
    const response = [
      call('c1__vscode-1'),
      { kind: 'undoStop', id: 'u1' },
      group,
      group,
      call('c2__vscode-2'),
      { kind: 'undoStop', id: 'u2' },
      group
    ];
    const root = snapshot([request('r1', 'go', 1, response)]);
    const parts = projectDetail(root, projectSummary(root, 'file', 0), 1, quiet, []).requests[0]
      ?.parts;
    expect(parts?.filter((part) => part.kind === 'edit')).toEqual([
      { ...edit, stopId: 'u1', callId: 'c1' },
      { ...edit, stopId: 'u2', callId: 'c2' }
    ]);
  });

  it('anchors late edits to the tool call that wrote the file', () => {
    const uris = (...paths: string[]) =>
      Object.fromEntries(paths.map((path) => [`file://${path}`, { path, scheme: 'file' }]));
    const call = (id: string, toolId: string, paths: string[]) => ({
      kind: 'toolInvocationSerialized',
      toolCallId: id,
      toolId,
      invocationMessage: { value: 'Tool', uris: uris(...paths) },
      presentation: toolId === 'copilot_multiReplaceString' ? 'hidden' : undefined,
      isComplete: true
    });
    const response = [
      call('c1__vscode-1', 'copilot_multiReplaceString', ['/repo/a.ts', '/repo/b.ts']),
      call('c2__vscode-2', 'copilot_readFile', ['/repo/a.ts']),
      call('c3__vscode-3', 'copilot_createFile', ['/repo/c.ts']),
      call('c4__vscode-4', 'run_in_terminal', []),
      { kind: 'undoStop', id: 'u1' },
      group,
      { kind: 'undoStop', id: 'u2' },
      { ...group, uri: { path: '/repo/b.ts' } }
    ];
    const root = snapshot([request('r1', 'go', 1, response)]);
    const parts = projectDetail(root, projectSummary(root, 'file', 0), 1, quiet, []).requests[0]
      ?.parts;
    expect(parts?.filter((part) => part.kind === 'edit')).toEqual([
      { ...edit, stopId: 'u1', callId: 'c1' },
      { ...edit, path: '/repo/b.ts', stopId: 'u2', callId: 'c1' }
    ]);
  });

  it('collects edited file paths across requests', () => {
    const edit = (uri: object) => ({ kind: 'textEditGroup', uri });
    const root = snapshot([
      request('r0', 'one', 1, [edit({ scheme: 'file', fsPath: '/repo/a.ts', path: '/repo/a.ts' })]),
      request('r1', 'two', 1, [
        edit({ scheme: 'untitled', path: 'Untitled-1' }),
        edit({ path: '/repo/b.ts' }),
        edit({ scheme: 'file', fsPath: '/repo/a.ts', path: '/repo/a.ts' })
      ])
    ]);
    expect(editedPaths(root)).toEqual(['/repo/a.ts', '/repo/b.ts']);
    expect(projectDetail(root, projectSummary(root, 'file', 0), 1, quiet, []).editedFiles).toBe(2);
  });

  it('reads the session permission level', () => {
    const root = snapshot([request('r1', 'go', 1)], {
      inputState: { permissionLevel: 'autopilot' }
    });
    expect(projectDetail(root, projectSummary(root, 'file', 0), 1, quiet, []).permission).toBe(
      'autopilot'
    );
  });

  const carousel = (extra: object) => ({
    kind: 'questionCarousel',
    resolveId: 'q1',
    allowSkip: true,
    questions: [
      {
        id: 'shape',
        type: 'singleSelect',
        title: 'Shape',
        message: 'Pick one',
        options: [{ id: 'a', label: 'Round', value: 'round' }],
        defaultValue: 'round'
      },
      { id: 'broken', type: 'slider' }
    ],
    ...extra
  });

  it.each([
    ['pending while the request waits', 4, true, carousel({}), 'pending'],
    ['expired once the request ended', 1, true, carousel({}), 'expired'],
    ['done when answered', 1, true, carousel({ isUsed: true }), 'done'],
    [
      'pending for the latest confirmation',
      1,
      true,
      { kind: 'confirmation', title: 'Continue?', buttons: ['Continue', 'Pause'] },
      'pending'
    ],
    [
      'expired for an older confirmation',
      1,
      false,
      { kind: 'confirmation', title: 'Continue?', buttons: ['Continue'] },
      'expired'
    ],
    [
      'pending for a waiting elicitation',
      4,
      true,
      { kind: 'elicitationSerialized', title: { value: 'Run outside?' }, state: 'pending' },
      'pending'
    ],
    [
      'accepted for a resolved elicitation',
      1,
      true,
      { kind: 'elicitationSerialized', title: { value: 'Run outside?' }, state: 'accepted' },
      'accepted'
    ]
  ])('marks interaction %s', (_name, value, latest, part, expected) => {
    const requests = [request('r1', 'go', value, [part])];
    if (!latest) requests.push(request('r2', 'next', 1));
    const root = snapshot(requests);
    const detail = projectDetail(root, projectSummary(root, 'file', 0), 2, quiet, []);
    expect(detail.requests[0]?.parts[0]).toMatchObject({ state: expected });
  });

  it('projects questions and recorded answers', () => {
    const part = carousel({ isUsed: true, data: { shape: { selectedValue: 'round' } } });
    const root = snapshot([request('r1', 'go', 1, [part])]);
    expect(
      projectDetail(root, projectSummary(root, 'file', 0), 1, quiet, []).requests[0]?.parts
    ).toEqual([
      {
        kind: 'questions',
        resolveId: 'q1',
        allowSkip: true,
        state: 'done',
        questions: [
          {
            id: 'shape',
            type: 'singleSelect',
            title: 'Shape',
            message: 'Pick one',
            options: [{ id: 'a', label: 'Round', value: 'round' }],
            defaultValue: 'round',
            allowFreeformInput: true,
            required: false
          }
        ],
        answers: { shape: { selectedValue: 'round' } }
      }
    ]);
  });

  it('omits activity for idle sessions and reports failures', () => {
    const failed = { ...request('r1', 'go', 3), result: { errorDetails: { message: 'Quota' } } };
    const root = snapshot([failed]);
    const activity: Activity = {
      ...quiet,
      events: [{ type: 'message', at: 1, text: 'late', reasoning: null }]
    };
    const detail = projectDetail(root, projectSummary(root, 'file', 0), 10, activity, []);
    expect(detail.requests[0]?.parts).toEqual([]);
    expect(detail.requests[0]?.error).toBe('Quota');
  });

  it.each([
    [false, 'pending'],
    [true, 'complete']
  ])('settles a pending request when the agent stopped: %s', (settled, expected) => {
    const root = snapshot([request('r1', 'go', 0)]);
    const detail = projectDetail(
      root,
      projectSummary(root, 'file', 0),
      1,
      { ...quiet, settled },
      []
    );
    expect(detail.requests[0]?.state).toBe(expected);
  });
});
