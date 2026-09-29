import { setTimeout as delay } from 'node:timers/promises';

import * as vscode from 'vscode';

import type { SessionFlags } from '../sessions/sessionFlags';
import { sessionResource } from './chatSession';

const AGENT_SESSION_CONTEXT = 25;
const ARCHIVE_PROMPT_MS = 3000;

export class SessionOrganizer {
  constructor(
    private readonly canOrganize: boolean,
    private readonly expectFlags: (sessionId: string, flags: Partial<SessionFlags>) => void
  ) {}

  async setPinned(sessionId: string, pinned: boolean): Promise<void> {
    this.requireOrganize();
    await this.agentSessionCommand(pinned ? 'agentSession.pin' : 'agentSession.unpin', sessionId);
    this.expectFlags(sessionId, { pinned });
  }

  async setArchived(sessionId: string, archived: boolean): Promise<void> {
    this.requireOrganize();
    const done = this.agentSessionCommand(
      archived ? 'agentSession.archive' : 'agentSession.unarchive',
      sessionId
    ).then(() => this.expectFlags(sessionId, { archived }));
    const prompted = delay(ARCHIVE_PROMPT_MS, true, { ref: false });
    if (await Promise.race([done.then(() => false), prompted])) {
      throw new Error('VS Code asks what to do with the pending edits of this chat');
    }
  }

  private requireOrganize(): void {
    if (!this.canOrganize) {
      throw new Error('Chats in a window without a folder cannot be pinned or archived');
    }
  }

  private async agentSessionCommand(id: string, sessionId: string): Promise<void> {
    const session = { resource: sessionResource(sessionId) };
    await vscode.commands.executeCommand(id, {
      $mid: AGENT_SESSION_CONTEXT,
      session,
      sessions: [session]
    });
  }
}
