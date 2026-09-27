export const SESSION_ID = '5f1c2a9e-0000-4000-8000-000000000001';

export function request(id: string, text: string, state: number, response: unknown[] = []) {
  return {
    requestId: id,
    timestamp: 1_700_000_000_000,
    agent: { id: 'github.copilot.editsAgent' },
    modelId: 'copilot/claude-sonnet',
    modelState: { value: state },
    message: { text, parts: [] },
    response
  };
}

export function snapshot(requests: unknown[], extra: Record<string, unknown> = {}) {
  return {
    version: 3,
    creationDate: 1_699_999_000_000,
    sessionId: SESSION_ID,
    requests,
    pendingRequests: [],
    inputState: {
      mode: { id: 'file:///Users/dev/.github/agents/Reviewer.agent.md', kind: 'agent' },
      selectedModel: { identifier: 'copilot/gpt-5' }
    },
    ...extra
  };
}

export function logLines(...entries: unknown[]): string {
  return entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n';
}

export function transcriptLine(
  type: string,
  data: Record<string, unknown>,
  second: number,
  base = Date.UTC(2026, 0, 1)
) {
  return JSON.stringify({
    type,
    data,
    id: `${type}-${second}`,
    timestamp: new Date(base + second * 1000).toISOString(),
    parentId: null
  });
}
