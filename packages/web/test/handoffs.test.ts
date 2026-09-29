import type { Agent, Handoff, RequestState, SessionDetail } from '@pocket-pilot/protocol';
import { describe, expect, it } from 'vitest';

import { autopilotHandoff, handoffSource } from '../src/lib/hub/handoffs';

const handoff = (label: string, send: boolean): Handoff => ({
  id: `agent:${label}`,
  label,
  agent: 'agent',
  prompt: label,
  send
});

const agent = (id: string, name: string, handoffs: Handoff[]): Agent => ({
  id,
  name,
  description: null,
  builtin: true,
  handoffs
});

const AGENTS = [
  agent('agent', 'Agent', []),
  agent('file:///plan.agent.md', 'Plan', [handoff('Start', true)]),
  agent('file:///review.agent.md', 'Reviewer', [handoff('Fix', true)])
];

const detail = (state: RequestState | null, agentName: string | null): SessionDetail => ({
  id: 's',
  title: 't',
  status: 'idle',
  modelId: null,
  modeId: null,
  permission: 'default',
  editedFiles: 0,
  todos: null,
  totalRequests: state ? 1 : 0,
  requests: state
    ? [
        {
          id: 'r',
          timestamp: 0,
          message: 'm',
          modelId: null,
          agentName,
          state,
          error: null,
          editable: true,
          disabled: false,
          editedPaths: [],
          images: [],
          parts: []
        }
      ]
    : [],
  queued: []
});

describe('handoffs', () => {
  it.each<[RequestState | null, string | null, string | null, string | null]>([
    ['complete', 'Plan', 'file:///review.agent.md', 'Plan'],
    ['failed', 'file:///plan.agent.md', null, 'Plan'],
    ['complete', null, 'file:///review.agent.md', 'Reviewer'],
    ['complete', 'Agent', 'file:///plan.agent.md', null],
    ['complete', 'Gone', null, null],
    ['cancelled', 'Plan', null, null],
    ['pending', 'Plan', null, null],
    ['needsInput', 'Plan', null, null],
    [null, null, 'file:///plan.agent.md', null]
  ])('offers from the agent of a %s %s response', (state, agentName, modeId, expected) => {
    expect(handoffSource(AGENTS, detail(state, agentName), modeId)?.name ?? null).toBe(expected);
  });

  it.each([
    [[handoff('Edit', false), handoff('Start', true), handoff('Open', true)], 'Start'],
    [[handoff('Edit', false)], null]
  ])('adds autopilot after the first sent handoff %#', (handoffs, expected) => {
    expect(autopilotHandoff(agent('a', 'A', handoffs))?.label ?? null).toBe(expected);
  });
});
