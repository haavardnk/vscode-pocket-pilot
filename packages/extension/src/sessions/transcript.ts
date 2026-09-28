import type { HookEvent } from '@pocket-pilot/protocol';

import { asRecord, asString } from '../json';

const MAX_BUFFERED_EVENTS = 2000;
const PROMPT_SKEW_MS = 15_000;

export type TranscriptEvent =
  | { type: 'user'; id: string; at: number; content: string }
  | { type: 'message'; at: number; text: string; reasoning: string | null }
  | { type: 'toolStart'; at: number; callId: string; name: string; args: string | null }
  | { type: 'toolEnd'; at: number; callId: string; success: boolean };

export interface TranscriptTurn {
  id: string;
  at: number;
  content: string;
  events: TranscriptEvent[];
}

function text(value: unknown): string {
  return asString(value) ?? '';
}

export function toolCallId(raw: string): string {
  return raw.split('__vscode')[0] ?? raw;
}

function argumentsText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function parseTranscriptLine(line: string): TranscriptEvent | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  const event = asRecord(raw);
  const data = asRecord(event.data);
  const at = Date.parse(text(event.timestamp)) || 0;
  switch (event.type) {
    case 'user.message':
      return { type: 'user', id: text(event.id), at, content: text(data.content) };
    case 'assistant.message':
      return {
        type: 'message',
        at,
        text: text(data.content),
        reasoning: text(data.reasoningText) || null
      };
    case 'tool.execution_start':
      return {
        type: 'toolStart',
        at,
        callId: toolCallId(text(data.toolCallId)),
        name: text(data.toolName),
        args: argumentsText(data.arguments)
      };
    case 'tool.execution_complete':
      return {
        type: 'toolEnd',
        at,
        callId: toolCallId(text(data.toolCallId)),
        success: data.success === true
      };
    default:
      return null;
  }
}

export function matchesRequest(content: string, request: string): boolean {
  const wanted = request.trim();
  return wanted.length > 0 && content.includes(wanted);
}

function supersedes(real: TranscriptEvent, synthetic: TranscriptEvent): boolean {
  if (real.type !== synthetic.type) return false;
  if (real.type === 'user' && synthetic.type === 'user') {
    if (real.at >= synthetic.at) return true;
    return (
      real.at >= synthetic.at - PROMPT_SKEW_MS && matchesRequest(real.content, synthetic.content)
    );
  }
  return 'callId' in real && 'callId' in synthetic && real.callId === synthetic.callId;
}

function splitTurns(events: TranscriptEvent[]): TranscriptTurn[] {
  const turns: TranscriptTurn[] = [{ id: '', at: 0, content: '', events: [] }];
  const running = new Set<string>();
  for (const event of events) {
    if (event.type === 'user' && running.size === 0) {
      turns.push({ id: event.id, at: event.at, content: event.content, events: [] });
      continue;
    }
    const turn = turns[turns.length - 1];
    if (!turn) continue;
    if (event.type === 'toolStart') running.add(event.callId);
    if (event.type === 'toolEnd') running.delete(event.callId);
    turn.events.push(event);
  }
  return turns;
}

export class TranscriptBuffer {
  private events: TranscriptEvent[] = [];
  private synthetic: TranscriptEvent[] = [];

  clear(): void {
    this.events = [];
    this.synthetic = [];
  }

  append(lines: string[]): void {
    for (const line of lines) {
      const event = parseTranscriptLine(line);
      if (event) this.events.push(event);
    }
    if (this.events.length > MAX_BUFFERED_EVENTS) {
      this.events = this.events.slice(-MAX_BUFFERED_EVENTS);
    }
    this.synthetic = this.synthetic.filter((event) => !this.logged(event));
  }

  hook(event: HookEvent): void {
    if (event.kind === 'stop') {
      this.synthetic.push(
        ...[...this.running()].map((callId): TranscriptEvent => ({
          type: 'toolEnd',
          at: event.at,
          callId,
          success: true
        }))
      );
      return;
    }
    const synthetic = this.syntheticEvent(event);
    if (!this.logged(synthetic)) this.synthetic.push(synthetic);
  }

  turns(): TranscriptTurn[] {
    return splitTurns(this.merged());
  }

  turnFor(requestText: string): TranscriptTurn | undefined {
    const turns = this.turns();
    return turns.findLast((turn) => matchesRequest(turn.content, requestText)) ?? turns.at(-1);
  }

  private merged(): TranscriptEvent[] {
    return [...this.events, ...this.synthetic].sort((a, b) => a.at - b.at);
  }

  private running(): Set<string> {
    const running = new Set<string>();
    for (const event of this.merged()) {
      if (event.type === 'toolStart') running.add(event.callId);
      if (event.type === 'toolEnd') running.delete(event.callId);
    }
    return running;
  }

  private logged(synthetic: TranscriptEvent): boolean {
    return this.events.some((real) => supersedes(real, synthetic));
  }

  private syntheticEvent(event: Exclude<HookEvent, { kind: 'stop' }>): TranscriptEvent {
    switch (event.kind) {
      case 'prompt':
        return { type: 'user', id: `hook-${event.at}`, at: event.at, content: event.prompt };
      case 'toolStart':
        return {
          type: 'toolStart',
          at: event.at,
          callId: event.callId,
          name: event.toolName,
          args: null
        };
      case 'toolEnd':
        return { type: 'toolEnd', at: event.at, callId: event.callId, success: true };
    }
  }
}
