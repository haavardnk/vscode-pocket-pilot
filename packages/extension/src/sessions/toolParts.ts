import type { ResponsePart, Subagent, ToolImageResult, ToolStatus } from '@pocket-pilot/protocol';

import { asArray, asRecord, asString, type JsonRecord } from '../json';
import { linkedMessage, resultLinks } from './fileLinks';
import { clip, DETAIL_LENGTH } from './partText';
import { MAX_SHOWN_IMAGE_BYTES, shownType } from './requestImages';

type ToolPart = Extract<ResponsePart, { kind: 'tool' }>;
type Outcome = 'skipped' | 'denied' | null;

const DENIED = 0;
const SKIPPED = 5;
const EDIT_TOOLS = new Set([
  'copilot_replaceString',
  'copilot_multiReplaceString',
  'copilot_applyPatch',
  'copilot_insertEdit'
]);
const WRITE_TOOLS = new Set([...EDIT_TOOLS, 'copilot_createFile']);
const ASK_TOOLS = new Set([
  'copilot_askQuestions',
  'vscode_askQuestions',
  'ask_user',
  'AskUserQuestion',
  'request_user_input'
]);
const SESSION_TOOLS = ['create_session', 'create_chat', 'send_message'];

export function writtenPaths(part: JsonRecord): string[] | null {
  if (!WRITE_TOOLS.has(asString(part.toolId) ?? '')) return null;
  return [part.invocationMessage, part.pastTenseMessage].flatMap((message) =>
    Object.values(asRecord(asRecord(message).uris)).flatMap((raw) => {
      const uri = asRecord(raw);
      return asString(uri.fsPath) ?? asString(uri.path) ?? [];
    })
  );
}

function isHiddenTool(part: JsonRecord): boolean {
  return (
    part.presentation === 'hidden' ||
    (part.presentation === 'hiddenAfterComplete' && part.isComplete !== false)
  );
}

function terminalCommand(data: JsonRecord): string | null {
  const command = asRecord(data.commandLine);
  const text =
    asString(command.forDisplay) ??
    asString(command.userEdited) ??
    asString(command.toolEdited) ??
    asString(command.original);
  return text?.trim() || null;
}

function resultText(result: JsonRecord): string {
  const output = asArray(result.output)
    .map(asRecord)
    .flatMap((item) => (item.isText === true ? (asString(item.value) ?? []) : []))
    .join('');
  return [asString(result.input), output].filter(Boolean).join('\n\n').slice(0, DETAIL_LENGTH);
}

function toolImages(part: JsonRecord): ToolImageResult[] {
  return asArray(asRecord(part.resultDetails).output).flatMap((raw): ToolImageResult[] => {
    const item = asRecord(raw);
    const mimeType = shownType(item.mimeType);
    const data = asString(item.value);
    return mimeType && data ? [{ kind: 'toolImage', mimeType, data }] : [];
  });
}

export function toolImage(part: JsonRecord, index: number): ToolImageResult | null {
  const image = toolImages(part)[index];
  if (!image) return null;
  if (Buffer.byteLength(image.data, 'base64') > MAX_SHOWN_IMAGE_BYTES) {
    throw new Error('Image is too large to show');
  }
  return image;
}

function toolDetail(part: JsonRecord): string | null {
  const data = asRecord(part.toolSpecificData);
  if (data.kind === 'terminal') return terminalCommand(data);
  if (data.kind === 'input' && data.rawInput !== undefined) {
    return clip(JSON.stringify(data.rawInput), DETAIL_LENGTH);
  }
  return resultText(asRecord(part.resultDetails)) || null;
}

export function inlineCode(text: string): string {
  const fence = '`'.repeat(Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length)) + 1);
  const padding = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${fence}${padding}${text}${padding}${fence}`;
}

export function terminalMessage(command: string, status: ToolStatus, outcome: Outcome): string {
  const verb =
    outcome === 'skipped'
      ? 'Skipped'
      : outcome === 'denied'
        ? 'Denied'
        : status === 'running'
          ? 'Running'
          : 'Ran';
  return `${verb} ${inlineCode(command)}`;
}

export function groupedByName(toolId: string): boolean {
  const name = toolId.toLowerCase();
  return !(
    name.includes('mcp') ||
    name.includes('mermaid') ||
    ASK_TOOLS.has(toolId) ||
    SESSION_TOOLS.some((tool) => toolId === tool || toolId.endsWith(`__${tool}`)) ||
    toolId === 'image_gen.imagegen'
  );
}

function isGrouped(part: JsonRecord, toolId: string, awaitingConfirmation: boolean): boolean {
  const data = asRecord(part.toolSpecificData);
  return (
    groupedByName(toolId) &&
    !awaitingConfirmation &&
    asRecord(part.source).type !== 'mcp' &&
    data.kind !== 'subagent' &&
    data.kind !== 'generatedImage' &&
    asString(part.subAgentInvocationId) === null &&
    !(data.kind === 'input' && Boolean(data.mcpAppData))
  );
}

function subagentOf(data: JsonRecord): Subagent | null {
  if (data.kind !== 'subagent') return null;
  return {
    agentName: asString(data.agentName),
    description: asString(data.description) ?? '',
    model: asString(data.modelName),
    result: asString(data.result)
  };
}

function outcomeOf(part: JsonRecord): Outcome {
  const type = asRecord(part.isConfirmed).type;
  if (type === SKIPPED) return 'skipped';
  return type === DENIED ? 'denied' : null;
}

export function projectTool(
  part: JsonRecord,
  awaitingConfirmation: boolean,
  known: ToolStatus | undefined
): ToolPart | null {
  if (isHiddenTool(part)) return null;
  const toolId = asString(part.toolId) ?? '';
  const outcome = outcomeOf(part);
  const status =
    outcome === 'denied' || asRecord(part.resultDetails).isError === true
      ? 'failed'
      : (known ?? 'done');
  if (EDIT_TOOLS.has(toolId) && !awaitingConfirmation && status !== 'failed') return null;
  const data = asRecord(part.toolSpecificData);
  const command = data.kind === 'terminal' ? terminalCommand(data) : null;
  return {
    kind: 'tool',
    callId: asString(part.toolCallId) ?? '',
    toolId,
    message: command
      ? terminalMessage(command, status, outcome)
      : linkedMessage(status === 'running' ? part.invocationMessage : part.pastTenseMessage) ||
        linkedMessage(part.invocationMessage),
    detail: toolDetail(part),
    links: resultLinks(part),
    images: toolImages(part).length,
    title: asString(part.generatedTitle),
    grouped: isGrouped(part, toolId, awaitingConfirmation),
    awaitingConfirmation,
    status,
    terminal: null,
    subagent: subagentOf(data),
    parentCallId: asString(part.subAgentInvocationId)
  };
}
