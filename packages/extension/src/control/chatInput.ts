import type { Agent, Model, PermissionLevel, SessionDetail } from '@pocket-pilot/protocol';
import * as vscode from 'vscode';

import { selectModel, sessionResource, submitChat } from './chatSession';
import { PERMISSION_COMMANDS } from './interactions';

export type ChatInput = Pick<SessionDetail, 'modeId' | 'modelId' | 'permission'>;

export interface InputChange {
  modeId: string | null;
  model: Model | null;
  permission: PermissionLevel | null;
}

export interface ChatInputSources {
  models: () => Promise<Model[]>;
  agents: () => Promise<Agent[]>;
  expectPermission: (sessionId: string, level: PermissionLevel) => void;
  expectMode: (sessionId: string, modeId: string) => void;
  expectModel: (sessionId: string, modelId: string) => void;
}

export class ChatInputs {
  constructor(private readonly sources: ChatInputSources) {}

  async change(sessionId: string, from: ChatInput, to: InputChange): Promise<ChatInput> {
    const modeId = to.modeId ?? from.modeId;
    const modelId = to.model?.id ?? from.modelId;
    const permission = to.permission ?? from.permission;
    if (modeId && modeId !== from.modeId) await this.setMode(sessionId, modeId);
    if (to.model && modelId !== from.modelId) await this.setModel(sessionId, to.model);
    if (permission !== from.permission) await this.setPermission(sessionId, permission);
    return { modeId, modelId, permission };
  }

  async setMode(sessionId: string, modeId: string): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.chat.toggleAgentMode', {
      modeId,
      sessionResource: sessionResource(sessionId)
    });
    this.sources.expectMode(sessionId, modeId);
  }

  async setModel(sessionId: string, model: Model): Promise<void> {
    await selectModel(model);
    this.sources.expectModel(sessionId, model.id);
  }

  async setPermission(sessionId: string, level: PermissionLevel): Promise<void> {
    await submitChat(sessionId, PERMISSION_COMMANDS[level]);
    this.sources.expectPermission(sessionId, level);
  }

  async requireAgent(modeId: string): Promise<void> {
    const agents = await this.sources.agents();
    if (!agents.some((agent) => agent.id === modeId)) throw new Error('Unknown agent');
  }

  async requireModel(modelId: string): Promise<Model> {
    const model = (await this.sources.models()).find((candidate) => candidate.id === modelId);
    if (!model) throw new Error('Unknown model');
    return model;
  }
}
