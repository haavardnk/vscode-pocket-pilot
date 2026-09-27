import type { TerminalRef } from '@pocket-pilot/protocol';

const MATCH_WINDOW_MS = 60_000;
const MAX_UNCLAIMED = 100;
const MAX_REFS = 1000;

export interface ChatCall {
  sessionId: string;
  callId: string;
}

interface Expected extends ChatCall {
  command: string;
  at: number;
}

interface Unclaimed extends TerminalRef {
  command: string;
  at: number;
}

export interface ChatLink extends ChatCall, TerminalRef {}

function normalize(command: string): string {
  return command.trim().replace(/\s+/g, ' ');
}

export function sameCommand(expected: string, executed: string): boolean {
  const wanted = normalize(expected);
  const ran = normalize(executed);
  if (!wanted || !ran) return false;
  return wanted === ran || wanted.endsWith(` ${ran}`) || ran.startsWith(`${wanted} `);
}

export class ChatLinks {
  private expected: Expected[] = [];
  private unclaimed: Unclaimed[] = [];
  private readonly refs = new Map<string, TerminalRef>();

  ref(callId: string): TerminalRef | null {
    return this.refs.get(callId) ?? null;
  }

  expect(call: ChatCall, command: string, at: number): ChatLink | null {
    this.prune(at);
    const index = this.unclaimed.findIndex(
      (execution) => execution.at >= at - MATCH_WINDOW_MS && sameCommand(command, execution.command)
    );
    const execution = this.unclaimed[index];
    if (!execution) {
      this.expected.push({ ...call, command, at });
      return null;
    }
    this.unclaimed.splice(index, 1);
    return this.link(call, execution);
  }

  executed(execution: TerminalRef, command: string, at: number): ChatLink | null {
    this.prune(at);
    this.unclaimed = this.unclaimed.filter((item) => item.executionId !== execution.executionId);
    const index = this.expected.findIndex((call) => sameCommand(call.command, command));
    const call = this.expected[index];
    if (!call) {
      this.unclaimed.push({ ...execution, command, at });
      this.unclaimed.splice(0, this.unclaimed.length - MAX_UNCLAIMED);
      return null;
    }
    this.expected.splice(index, 1);
    return this.link(call, execution);
  }

  claim(call: ChatCall, command: string, after: number): ChatLink | null {
    const index = this.unclaimed.findIndex(
      (execution) => execution.at >= after && sameCommand(command, execution.command)
    );
    const execution = this.unclaimed[index];
    if (!execution) return null;
    this.unclaimed.splice(index, 1);
    return this.link(call, execution);
  }

  forget(terminalId: string): void {
    this.unclaimed = this.unclaimed.filter((execution) => execution.terminalId !== terminalId);
    for (const [callId, ref] of this.refs) {
      if (ref.terminalId === terminalId) this.refs.delete(callId);
    }
  }

  private link(call: ChatCall, execution: TerminalRef): ChatLink {
    const ref = { terminalId: execution.terminalId, executionId: execution.executionId };
    this.refs.set(call.callId, ref);
    const oldest = this.refs.keys().next().value;
    if (this.refs.size > MAX_REFS && oldest !== undefined) this.refs.delete(oldest);
    return { sessionId: call.sessionId, callId: call.callId, ...ref };
  }

  private prune(now: number): void {
    this.expected = this.expected.filter((call) => call.at >= now - MATCH_WINDOW_MS);
  }
}
