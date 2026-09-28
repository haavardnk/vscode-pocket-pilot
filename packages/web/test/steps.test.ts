import type { RequestState, ResponsePart } from '@pocket-pilot/protocol';
import { describe, expect, it } from 'vitest';

import { responseItems } from '../src/lib/hub/steps';

const thinking = (text: string, title: string | null = null) =>
  ({ kind: 'thinking', text, title }) as const;
const tool = (title: string | null = null, grouped = true) =>
  ({
    kind: 'tool',
    callId: 'c',
    toolId: 'read_file',
    message: 'Read',
    detail: null,
    title,
    grouped,
    awaitingConfirmation: !grouped,
    status: 'done',
    terminal: null,
    subagent: null,
    parentCallId: null
  }) as const;
const edit = (additions: number | null, deletions: number | null) =>
  ({ kind: 'edit', path: 'a.ts', stopId: null, callId: null, additions, deletions }) as const;
const text = (value: string) => ({ kind: 'markdown', text: value }) as const;

function titles(parts: ResponsePart[], state: RequestState = 'complete'): (string | null)[] {
  return responseItems(parts, state).map((item) => (item.kind === 'group' ? item.title : null));
}

describe('response steps', () => {
  it('merges adjacent markdown and leaves a lone edit in place', () => {
    expect(
      responseItems(
        [text('```ts\nconst a'), text(' = 1;\n```'), edit(1, 0), text('done')],
        'complete'
      )
    ).toEqual([text('```ts\nconst a = 1;\n```'), edit(1, 0), text('done')]);
  });

  it('groups a run of steps with its title and summed diff', () => {
    const steps = [thinking('look'), tool('Read the docs'), edit(2, 1), edit(3, 0)];
    expect(responseItems([...steps, text('done')], 'complete')).toEqual([
      {
        kind: 'group',
        title: 'Read the docs',
        active: false,
        steps,
        additions: 5,
        deletions: 1
      },
      text('done')
    ]);
  });

  it.each([
    [[thinking('a', 'Plan'), tool('Tool title')], 'Plan'],
    [[thinking('a'), thinking('b', 'Later'), tool('Tool title')], 'Tool title'],
    [[tool(), thinking('a', 'Later')], 'Later'],
    [[thinking('**Reading docs**\nThen more')], 'Reading docs'],
    [[thinking('**One**'), thinking('**Two**')], 'Finished Working'],
    [[thinking('**Reading docs**'), tool()], 'Finished with 1 step'],
    [[thinking('a'), tool(), edit(null, null)], 'Finished with 2 steps']
  ] as const)('titles a finished group %#', (parts, title) => {
    expect(titles([...parts])).toEqual([title]);
  });

  it('keeps the last run open while the request works', () => {
    const items = responseItems([thinking('a'), text('b'), tool('Done title')], 'pending');
    expect(items[0]).toMatchObject({ kind: 'group', active: false, title: 'Finished Working' });
    expect(items[2]).toMatchObject({ kind: 'group', active: true, title: 'Working' });
  });

  it('splits runs at tools VS Code keeps outside and unwraps single tools', () => {
    const waiting = tool(null, false);
    expect(responseItems([tool(), waiting, tool()], 'complete')).toEqual([tool(), waiting, tool()]);
  });

  it('keeps one group across blank markdown', () => {
    expect(titles([thinking('a', 'Plan'), text('\n\n'), edit(1, 0), text(' '), tool()])).toEqual([
      'Plan'
    ]);
  });

  it('shows no diff when no edit has counts', () => {
    expect(responseItems([thinking('a'), edit(null, null)], 'complete')[0]).toMatchObject({
      additions: null,
      deletions: null
    });
  });

  it('nests tools under their subagent and keeps orphans inline', () => {
    const subagent = {
      ...tool(null, false),
      callId: 's1',
      subagent: { agentName: 'Explore', description: 'Survey', model: null, result: null }
    };
    const child = { ...tool(null, false), callId: 'c1', parentCallId: 's1' };
    const orphan = { ...tool(null, false), callId: 'c2', parentCallId: 'gone' };
    expect(responseItems([subagent, text('a'), child, orphan], 'complete')).toEqual([
      { kind: 'subagent', part: subagent, steps: [child] },
      text('a'),
      orphan
    ]);
  });
});
