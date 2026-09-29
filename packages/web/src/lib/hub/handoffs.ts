import type { Agent, Handoff, SessionDetail } from '@pocket-pilot/protocol';

export function handoffSource(
  agents: Agent[],
  detail: SessionDetail,
  modeId: string | null
): Agent | null {
  const last = detail.requests.at(-1);
  if (!last || (last.state !== 'complete' && last.state !== 'failed')) return null;
  const name = last.agentName;
  const source = name
    ? agents.find((agent) => agent.name === name || agent.id === name)
    : agents.find((agent) => agent.id === modeId);
  return source && source.handoffs.length > 0 ? source : null;
}

export function autopilotHandoff(agent: Agent): Handoff | null {
  return agent.handoffs.find((handoff) => handoff.send) ?? null;
}
