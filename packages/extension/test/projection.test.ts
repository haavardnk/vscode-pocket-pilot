import { describe, expect, it } from 'vitest';

import {
  type Activity,
  editedPaths,
  plainMessage,
  projectDetail,
  projectSummary
} from '../src/sessions/projection';
import { request, SESSION_ID, snapshot } from './fixtures';

const quiet: Activity = { statuses: new Map(), events: [], toolsOnly: false, settled: false };

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

  it('cleans tool messages', () => {
    expect(plainMessage({ value: 'Read [](file:///repo/src/app.ts), lines 1 to 5' })).toBe(
      'Read app.ts, lines 1 to 5'
    );
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
      pendingRequests: [{ id: 'q1', kind: 'steering', request: { message: { text: 'faster' } } }]
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
    expect(detail.queued).toEqual([{ id: 'q1', delivery: 'steering', text: 'faster' }]);
    expect(detail.requests).toHaveLength(1);
    expect(detail.requests[0]?.parts).toEqual([
      { kind: 'markdown', text: 'Looking at `a.ts` now.' },
      { kind: 'thinking', text: 'Consider this', title: 'Plan' },
      {
        kind: 'tool',
        callId: 'c1',
        toolId: 'run_in_terminal',
        message: 'Run tests',
        detail: 'npm test',
        awaitingConfirmation: true,
        status: 'running',
        terminal: null
      },
      { kind: 'edit', path: '/repo/a.ts' },
      { kind: 'thinking', text: 'Check first', title: null },
      { kind: 'markdown', text: 'All green' },
      {
        kind: 'tool',
        callId: 'c2',
        toolId: 'grep_search',
        message: 'grep_search',
        detail: '{"query":"x"}',
        awaitingConfirmation: false,
        status: 'running',
        terminal: null
      }
    ]);
    expect(detail.permission).toBe('default');
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
