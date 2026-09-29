import type { RequestView } from '@pocket-pilot/protocol';
import * as vscode from 'vscode';

import { focusChat, sessionResource } from './chatSession';
import type { RemovalPrompt } from './removalPrompt';

const CHAT_VIEW_CONTEXT = 19;

export interface CheckpointSources {
  requests: (sessionId: string) => Promise<RequestView[]>;
  disabled: (sessionId: string) => Promise<readonly string[]>;
  expectRestored: (sessionId: string, requestIds: readonly string[]) => void;
  expectRemoved: (sessionId: string, requestId: string) => void;
  prompt: RemovalPrompt;
}

export class CheckpointCommands {
  constructor(private readonly sources: CheckpointSources) {}

  async restore(sessionId: string, requestId: string): Promise<void> {
    const requests = await this.sources.requests(sessionId);
    const index = requests.findIndex((request) => request.id === requestId);
    const request = requests[index];
    if (!request?.editable) throw new Error('This message can no longer be restored');
    if (request.disabled) throw new Error('This message is already undone');
    await focusChat(sessionId);
    await this.sources.prompt.run(() =>
      vscode.commands.executeCommand('workbench.action.chat.restoreCheckpoint', {
        id: request.id,
        sessionResource: sessionResource(sessionId),
        message: { text: request.message, parts: [] },
        messageText: request.message,
        attachedContext: []
      })
    );
    this.sources.expectRestored(
      sessionId,
      requests.slice(index).map((item) => item.id)
    );
  }

  async redo(sessionId: string): Promise<void> {
    if ((await this.sources.disabled(sessionId)).length === 0) {
      throw new Error('There is nothing to redo');
    }
    await focusChat(sessionId);
    await vscode.commands.executeCommand('workbench.action.chat.redoEdit2', {
      $mid: CHAT_VIEW_CONTEXT,
      sessionResource: sessionResource(sessionId)
    });
    this.sources.expectRestored(sessionId, []);
  }

  async submitting(sessionId: string, submit: () => Promise<void>): Promise<void> {
    const [first] = await this.sources.disabled(sessionId);
    await submit();
    if (first === undefined) return;
    this.sources.expectRemoved(sessionId, first);
    this.sources.expectRestored(sessionId, []);
  }
}
