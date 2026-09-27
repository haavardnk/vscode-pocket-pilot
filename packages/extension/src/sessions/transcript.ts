import type { LiveEvent } from '@pocket-pilot/protocol';

import { asRecord, asString } from '../json';

const MAX_BUFFERED_EVENTS = 2000;
const MAX_LIVE_EVENTS = 60;

export type TranscriptEvent =
  | { type: 'user'; at: number; content: string }
  | { type: 'message'; at: number; text: string; reasoning: string | null }
  | { type: 'toolStart'; at: number; callId: string; name: string }
  | { type: 'toolEnd'; at: number; callId: string; success: boolean };

type ToolEvent = Extract<LiveEvent, { kind: 'tool' }>;

function text(value: unknown): string {
  return asString(value) ?? '';
}

export function parseTranscriptLine(line: string): TranscriptEvent | null {
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
      return { type: 'user', at, content: text(data.content) };
    case 'assistant.message':
      return {
        type: 'message',
        at,
        text: text(data.content),
        reasoning: text(data.reasoningText) || null
      };
    case 'tool.execution_start':
      return { type: 'toolStart', at, callId: text(data.toolCallId), name: text(data.toolName) };
    case 'tool.execution_complete':
      return { type: 'toolEnd', at, callId: text(data.toolCallId), success: data.success === true };
    default:
      return null;
  }
}

function matchesRequest(content: string, request: string): boolean {
  const wanted = request.trim();
  return wanted.length > 0 && content.includes(wanted);
}

export class TranscriptBuffer {
  private events: TranscriptEvent[] = [];

  clear(): void {
    this.events = [];
  }

  append(lines: string[]): void {
    for (const line of lines) {
      const event = parseTranscriptLine(line);
      if (event) this.events.push(event);
    }
    if (this.events.length > MAX_BUFFERED_EVENTS) {
      this.events = this.events.slice(-MAX_BUFFERED_EVENTS);
    }
  }

  liveFor(requestText: string): LiveEvent[] {
    const matching = this.events.findLastIndex(
      (event) => event.type === 'user' && matchesRequest(event.content, requestText)
    );
    const start =
      matching >= 0 ? matching : this.events.findLastIndex((event) => event.type === 'user');
    const following = this.events.slice(start + 1);
    const end = following.findIndex((event) => event.type === 'user');
    return foldLiveEvents(end >= 0 ? following.slice(0, end) : following);
  }
}

export function foldLiveEvents(events: TranscriptEvent[]): LiveEvent[] {
  const live: LiveEvent[] = [];
  const tools = new Map<string, ToolEvent>();
  for (const event of events) {
    if (event.type === 'message' && (event.text || event.reasoning)) {
      live.push({ kind: 'message', at: event.at, text: event.text, reasoning: event.reasoning });
    } else if (event.type === 'toolStart') {
      const tool: ToolEvent = {
        kind: 'tool',
        at: event.at,
        callId: event.callId,
        name: event.name,
        state: 'running'
      };
      tools.set(event.callId, tool);
      live.push(tool);
    } else if (event.type === 'toolEnd') {
      const tool = tools.get(event.callId);
      if (tool) tool.state = event.success ? 'succeeded' : 'failed';
    }
  }
  return live.slice(-MAX_LIVE_EVENTS);
}
