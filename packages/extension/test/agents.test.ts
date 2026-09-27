import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isAgentFile, parseAgentFile } from '../src/agents/agentFiles';
import { AgentSource, readAgents } from '../src/agents/agentSource';

const idFor = (path: string): string => `file://${path}`;

describe('agent files', () => {
  it.each([
    ['/w/prompts', 'Review.agent.md', true],
    ['/w/prompts', 'Old.chatmode.md', true],
    ['/w/prompts', 'notes.md', false],
    ['/w/.github/agents', 'notes.md', true],
    ['/w/.github/agents', 'README.md', false],
    ['/h/.copilot/agents/', 'x.md', true]
  ])('detects %s/%s', (folder, fileName, expected) => {
    expect(isAgentFile(folder, fileName)).toBe(expected);
  });

  it.each([
    [
      '---\nname: Plan\ndescription: Outlines plans\n---\nBody',
      { name: 'Plan', description: 'Outlines plans' }
    ],
    ['No header', { name: 'Fallback', description: null }],
    ['---\n: [broken\n---\n', { name: 'Fallback', description: null }]
  ])('parses header %#', (text, expected) => {
    expect(
      parseAgentFile({ id: 'x', fileName: 'Fallback.agent.md', builtin: false }, text)
    ).toEqual({
      id: 'x',
      builtin: false,
      ...expected
    });
  });

  it('hides agents that are not user invocable', () => {
    const text = '---\nname: Explore\nuser-invocable: false\n---\n';
    expect(
      parseAgentFile({ id: 'x', fileName: 'Explore.agent.md', builtin: true }, text)
    ).toBeNull();
  });
});

describe('AgentSource', () => {
  let folder: string;

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'agents-'));
    await mkdir(join(folder, 'storage', 'plan-agent'), { recursive: true });
    await mkdir(join(folder, 'storage', 'memory-tool'));
    await writeFile(
      join(folder, 'storage', 'plan-agent', 'Plan.agent.md'),
      '---\nname: Plan\n---\n'
    );
    await writeFile(join(folder, 'storage', 'memory-tool', 'Note.agent.md'), '');
  });

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  it('lists built-in, extension and user agents', async () => {
    const custom = join(folder, 'ws', '.github', 'agents');
    await mkdir(custom, { recursive: true });
    await writeFile(join(custom, 'Zed.md'), '');
    await writeFile(join(custom, 'Alpha.agent.md'), '');
    const agents = await readAgents(
      [
        { path: custom, builtin: false },
        { path: join(folder, 'missing'), builtin: false },
        { path: join(folder, 'storage'), builtin: true, children: /-agent$/ }
      ],
      idFor
    );
    expect(agents.map((agent) => [agent.name, agent.builtin])).toEqual([
      ['Agent', true],
      ['Plan', true],
      ['Alpha', false],
      ['Zed', false]
    ]);
    expect(agents[1]?.id).toBe(idFor(join(folder, 'storage', 'plan-agent', 'Plan.agent.md')));
  });

  it('notices agent folders created later', async () => {
    const source = new AgentSource(idFor, () => undefined);
    const custom = join(folder, 'later', '.github', 'agents');
    source.setFolders([{ path: custom, builtin: false }]);
    await new Promise((resolve) => setTimeout(resolve, 200));
    const changed = new Promise<void>((resolve) => source.onDidChange(resolve));
    await mkdir(custom, { recursive: true });
    await writeFile(join(custom, 'New.agent.md'), '---\nname: New\n---\n');
    await changed;
    expect((await source.list()).map((agent) => agent.name)).toEqual(['Agent', 'New']);
    source.dispose();
  });
});
