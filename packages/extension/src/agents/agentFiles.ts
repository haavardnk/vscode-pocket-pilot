import type { Agent, Handoff } from '@pocket-pilot/protocol';
import { parse } from 'yaml';

import { asArray, asRecord, asString } from '../json';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const AGENT_SUFFIX = /\.agent\.md$|\.chatmode\.md$|\.md$/;
const MARKDOWN_FOLDERS = ['/.github/agents', '/.claude/agents', '/.copilot/agents'];
const DESKTOP_EDITOR = 'untitled:';

export const BUILTIN_AGENTS: readonly Agent[] = [
  {
    id: 'agent',
    name: 'Agent',
    description: 'Describe what to build',
    builtin: true,
    handoffs: []
  }
];

export interface AgentFileRef {
  id: string;
  fileName: string;
  builtin: boolean;
}

export function isAgentFile(folder: string, fileName: string): boolean {
  if (fileName.endsWith('.agent.md') || fileName.endsWith('.chatmode.md')) return true;
  if (!fileName.endsWith('.md') || fileName === 'README.md') return false;
  const normalized = folder.replaceAll('\\', '/').replace(/\/$/, '');
  return MARKDOWN_FOLDERS.some((suffix) => normalized.endsWith(suffix));
}

function frontmatter(text: string): Record<string, unknown> {
  const match = FRONTMATTER.exec(text);
  if (!match?.[1]) return {};
  try {
    return asRecord(parse(match[1]));
  } catch {
    return {};
  }
}

function handoffs(value: unknown): Handoff[] {
  const parsed = asArray(value).flatMap((raw) => {
    const item = asRecord(raw);
    const agent = asString(item.agent);
    const label = asString(item.label);
    const prompt = asString(item.prompt);
    if (!agent || !label?.trim() || prompt === null || prompt.includes(DESKTOP_EDITOR)) return [];
    const slug = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const send = item.send === true || item.send === 'true';
    return [{ id: `${agent}:${slug}`, label, agent, prompt, send }];
  });
  return parsed.filter(
    (handoff, index) => parsed.findIndex((other) => other.id === handoff.id) === index
  );
}

export function parseAgentFile(ref: AgentFileRef, text: string): Agent | null {
  const header = frontmatter(text);
  if (header['user-invocable'] === false || header['user-invokable'] === false) return null;
  const name = asString(header.name)?.trim() || ref.fileName.replace(AGENT_SUFFIX, '');
  if (!name) return null;
  return {
    id: ref.id,
    name,
    description: asString(header.description)?.trim() || null,
    builtin: ref.builtin,
    handoffs: handoffs(header.handoffs)
  };
}
