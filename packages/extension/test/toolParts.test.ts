import { describe, expect, it } from 'vitest';

import { projectTool } from '../src/sessions/toolParts';

const terminal = (commandLine: object, extra: object = {}) => ({
  kind: 'toolInvocationSerialized',
  toolCallId: 'c1',
  toolId: 'run_in_terminal',
  invocationMessage: { value: 'Running' },
  pastTenseMessage: { value: '$(info) Enable shell integration to improve command detection' },
  toolSpecificData: { kind: 'terminal', commandLine },
  isComplete: true,
  ...extra
});

describe('tool parts', () => {
  it.each([
    [{ presentation: 'hidden' }],
    [{ presentation: 'hiddenAfterComplete', isComplete: true }],
    [{}]
  ])('hides tools VS Code hides %#', (extra) => {
    expect(projectTool({ toolId: 'copilot_replaceString', ...extra }, false, undefined)).toBeNull();
  });

  it.each([
    [true, {}],
    [false, { resultDetails: { isError: true } }]
  ])('shows edit tools that need attention %#', (awaiting, extra) => {
    const part = { toolId: 'copilot_applyPatch', ...extra };
    expect(projectTool(part, awaiting, undefined)).not.toBeNull();
  });

  it('keeps hiddenAfterComplete tools while they run', () => {
    const part = { toolId: 'x', presentation: 'hiddenAfterComplete', isComplete: false };
    expect(projectTool(part, false, 'running')).not.toBeNull();
  });

  it.each([
    [{ original: 'cd /repo && npm test', forDisplay: 'npm test' }, {}, undefined, 'Ran `npm test`'],
    [{ original: 'a', toolEdited: 'b', userEdited: 'c' }, {}, undefined, 'Ran `c`'],
    [{ original: 'npm test' }, {}, 'running', 'Running `npm test`'],
    [{ original: 'npm test' }, { isConfirmed: { type: 5 } }, undefined, 'Skipped `npm test`'],
    [{ original: 'npm test' }, { isConfirmed: { type: 0 } }, 'done', 'Denied `npm test`'],
    [{ original: 'echo `date`' }, {}, undefined, 'Ran `` echo `date` ``']
  ] as const)('labels terminal commands %#', (commandLine, extra, known, message) => {
    expect(projectTool(terminal(commandLine, extra), false, known)?.message).toBe(message);
  });

  it.each([
    [{ isConfirmed: { type: 0 } }, 'done', 'failed'],
    [{ isConfirmed: { type: 5 } }, 'done', 'done'],
    [{ isConfirmed: { type: 1 } }, 'running', 'running']
  ] as const)('derives the status from the confirmation %#', (extra, known, status) => {
    expect(projectTool({ toolId: 'copilot_readFile', ...extra }, false, known)?.status).toBe(
      status
    );
  });

  it('marks tools with an error result failed and shows the result', () => {
    const part = {
      toolId: 'run_playwright_code',
      pastTenseMessage: 'Browser action failed',
      resultDetails: {
        input: 'await page.reload();',
        output: [{ type: 'embed', isText: true, value: 'Target closed' }],
        isError: true
      }
    };
    expect(projectTool(part, false, 'done')).toMatchObject({
      message: 'Browser action failed',
      status: 'failed',
      detail: 'await page.reload();\n\nTarget closed'
    });
  });

  it.each([
    [{ toolId: 'copilot_readFile' }, false, true],
    [{ toolId: 'copilot_readFile' }, true, false],
    [{ toolId: 'search', source: { type: 'mcp' } }, false, false],
    [{ toolId: 'mcp_github_search' }, false, false],
    [{ toolId: 'renderMermaidDiagram' }, false, false],
    [{ toolId: 'vscode_askQuestions' }, false, false],
    [{ toolId: 'runSubagent', toolSpecificData: { kind: 'subagent' } }, false, false],
    [{ toolId: 'copilot_readFile', subAgentInvocationId: 's1' }, false, false],
    [{ toolId: 'mcp__sessions__create_session' }, false, false],
    [{ toolId: 'app', toolSpecificData: { kind: 'input', mcpAppData: {} } }, false, false]
  ])('groups like VS Code pins %#', (part, awaiting, grouped) => {
    expect(projectTool(part, awaiting, undefined)?.grouped).toBe(grouped);
  });

  it('carries the generated group title', () => {
    const part = { toolId: 'copilot_readFile', generatedTitle: 'Read project docs' };
    expect(projectTool(part, false, undefined)?.title).toBe('Read project docs');
  });
});
