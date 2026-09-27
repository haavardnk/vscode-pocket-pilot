import { describe, expect, it } from 'vitest';

import { plainMessage, projectDetail, projectSummary } from '../src/sessions/projection';
import { request, SESSION_ID, snapshot } from './fixtures';

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

  it('projects parts, queue and live events', () => {
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
        isConfirmed: null,
        isComplete: true
      },
      { kind: 'textEditGroup', uri: { path: '/repo/a.ts' } },
      { kind: 'textEditGroup', uri: { path: '/repo/a.ts' } },
      { kind: 'undoStop' }
    ];
    const root = snapshot([request('r0', 'old', 1), request('r1', 'go', 4, response)], {
      pendingRequests: [{ id: 'q1', kind: 'steering', request: { message: { text: 'faster' } } }]
    });
    const live = [{ kind: 'message' as const, at: 1, text: 'hi', reasoning: null }];
    const detail = projectDetail(root, projectSummary(root, 'file', 0), 1, () => live);
    expect(detail.totalRequests).toBe(2);
    expect(detail.queued).toEqual([{ id: 'q1', delivery: 'steering', text: 'faster' }]);
    expect(detail.live).toEqual(live);
    expect(detail.requests).toHaveLength(1);
    expect(detail.requests[0]?.parts).toEqual([
      { kind: 'markdown', text: 'Looking at `a.ts` now.' },
      { kind: 'thinking', text: 'Consider this', title: 'Plan' },
      {
        kind: 'tool',
        callId: 'c1',
        toolId: 'run_in_terminal',
        message: 'Run tests',
        awaitingConfirmation: true
      },
      { kind: 'edit', path: '/repo/a.ts' }
    ]);
  });

  it('omits live events for idle sessions and reports failures', () => {
    const failed = { ...request('r1', 'go', 3), result: { errorDetails: { message: 'Quota' } } };
    const root = snapshot([failed]);
    const detail = projectDetail(root, projectSummary(root, 'file', 0), 10, () => {
      throw new Error('should not read live events');
    });
    expect(detail.live).toEqual([]);
    expect(detail.requests[0]?.error).toBe('Quota');
  });
});
