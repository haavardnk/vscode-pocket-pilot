import type { EditState, SessionChange } from '@pocket-pilot/protocol';

import { hub } from './hub.svelte';
import { toasts } from './toasts.svelte';

const HOLD_MS = 120_000;

interface Decision {
  state: EditState;
  at: number;
}

function key(windowId: string, sessionId: string, path: string | null): string {
  return JSON.stringify([windowId, sessionId, path]);
}

class EditDecisionStore {
  private decisions = $state<Record<string, Decision>>({});

  async decide(
    windowId: string,
    sessionId: string,
    path: string | null,
    decision: 'keep' | 'undo'
  ): Promise<boolean> {
    try {
      await hub.command({ kind: 'editDecision', windowId, sessionId, decision, path });
    } catch (error) {
      toasts.error(error);
      return false;
    }
    this.decisions[key(windowId, sessionId, path)] = {
      state: decision === 'keep' ? 'kept' : 'undone',
      at: Date.now()
    };
    return true;
  }

  state(windowId: string, sessionId: string, file: SessionChange, now: number): EditState {
    if (file.state !== 'pending') return file.state;
    const latest = [
      this.decisions[key(windowId, sessionId, file.path)],
      this.decisions[key(windowId, sessionId, null)]
    ].reduce<Decision | null>(
      (best, decision) =>
        decision && now - decision.at < HOLD_MS && (!best || decision.at > best.at)
          ? decision
          : best,
      null
    );
    return latest?.state ?? 'pending';
  }
}

export const editDecisions = new EditDecisionStore();
