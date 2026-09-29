import { randomUUID } from 'node:crypto';

import {
  type Agent,
  type Command,
  type ImageResult,
  type Model,
  type PermissionLevel,
  PHONE_QUEUE_PREFIX,
  type QueuedRequest,
  type SessionDetail
} from '@pocket-pilot/protocol';
import * as vscode from 'vscode';

import type { ModelSettingsFile } from '../models/modelSettings';
import { withQueued } from '../sessions/queue';
import type { SessionFlags } from '../sessions/sessionFlags';
import type { ChatImages } from './chatImages';
import { ChatInputs } from './chatInput';
import { attachImages, focusChat, selectModel, sessionResource, submitChat } from './chatSession';
import type { CheckpointCommands } from './checkpointCommands';
import {
  answersError,
  confirmationPrompt,
  pendingQuestions,
  requirePendingElicitation
} from './interactions';
import { queuedImages, QueueRewrite } from './queueRewrite';
import { SessionOrganizer } from './sessionOrganizer';

export interface ControllerSources {
  models: () => Promise<Model[]>;
  agents: () => Promise<Agent[]>;
  detail: (sessionId: string) => Promise<SessionDetail | null>;
  image: (sessionId: string, requestId: string, imageId: string) => Promise<ImageResult | null>;
  editedFiles: (sessionId: string) => Promise<string[]>;
  expectFlags: (sessionId: string, flags: Partial<SessionFlags>) => void;
  expectQueue: (sessionId: string, items: QueuedRequest[]) => void;
  expectPermission: (sessionId: string, level: PermissionLevel) => void;
  expectMode: (sessionId: string, modeId: string) => void;
  expectModel: (sessionId: string, modelId: string) => void;
  checkpoints: CheckpointCommands;
  images: ChatImages;
  canOrganize: boolean;
  settings: ModelSettingsFile;
}

interface HandoffResult {
  success: boolean;
  error?: string;
}

export class Controller {
  private readonly inputs: ChatInputs;
  private readonly queue: QueueRewrite;
  private readonly organizer: SessionOrganizer;

  constructor(private readonly sources: ControllerSources) {
    this.inputs = new ChatInputs(sources);
    this.queue = new QueueRewrite(sources, this.inputs);
    this.organizer = new SessionOrganizer(sources.canOrganize, sources.expectFlags);
  }

  async run(command: Command): Promise<void> {
    switch (command.kind) {
      case 'send': {
        const before = command.delivery ? await this.sources.detail(command.sessionId) : null;
        const images = await this.sources.images.write(command.images);
        await this.sources.checkpoints.submitting(command.sessionId, () =>
          submitChat(command.sessionId, command.text, images, command.delivery)
        );
        if (command.delivery && (before?.status === 'running' || before?.status === 'needsInput')) {
          this.sources.expectQueue(
            command.sessionId,
            withQueued(before.queued, {
              id: PHONE_QUEUE_PREFIX + randomUUID(),
              delivery: command.delivery,
              text: command.text,
              modeId: before.modeId,
              modelId: before.modelId,
              permission: before.permission,
              images: queuedImages(images, command.images),
              attachments: 0
            })
          );
        }
        return;
      }
      case 'setQueue':
        await this.queue.apply(command);
        return;
      case 'stop':
        await focusChat(command.sessionId);
        await vscode.commands.executeCommand('workbench.action.chat.cancel');
        return;
      case 'setMode':
        await this.inputs.requireAgent(command.modeId);
        await this.inputs.setMode(command.sessionId, command.modeId);
        return;
      case 'handoff':
        await this.handoff(command);
        return;
      case 'setModel':
        await this.inputs.setModel(
          command.sessionId,
          await this.inputs.requireModel(command.modelId)
        );
        return;
      case 'editRequest':
        await this.editRequest(command);
        return;
      case 'restoreCheckpoint':
        await this.sources.checkpoints.restore(command.sessionId, command.requestId, true);
        return;
      case 'redoCheckpoint':
        await this.sources.checkpoints.redo(command.sessionId);
        return;
      case 'toolDecision':
        await focusChat(command.sessionId);
        await vscode.commands.executeCommand(
          command.decision === 'accept'
            ? 'workbench.action.chat.acceptTool'
            : 'workbench.action.chat.skipTool',
          { sessionResource: sessionResource(command.sessionId) }
        );
        return;
      case 'answerQuestions': {
        const part = pendingQuestions(
          await this.sources.detail(command.sessionId),
          command.resolveId
        );
        const error = answersError(part, command.answers);
        if (error) throw new Error(error);
        await vscode.commands.executeCommand(
          '_chat.notifyQuestionCarouselAnswer',
          command.resolveId,
          command.answers ?? undefined
        );
        return;
      }
      case 'confirm': {
        const prompt = confirmationPrompt(
          await this.sources.detail(command.sessionId),
          command.button
        );
        await submitChat(command.sessionId, prompt);
        return;
      }
      case 'acceptElicitation':
        requirePendingElicitation(await this.sources.detail(command.sessionId));
        await focusChat(command.sessionId);
        await vscode.commands.executeCommand('workbench.action.chat.acceptElicitation');
        return;
      case 'setPermission':
        await this.sources.checkpoints.submitting(command.sessionId, () =>
          this.inputs.setPermission(command.sessionId, command.level)
        );
        return;
      case 'setPinned':
        await this.organizer.setPinned(command.sessionId, command.pinned);
        return;
      case 'setArchived':
        await this.organizer.setArchived(command.sessionId, command.archived);
        return;
      case 'editDecision':
        await this.decideEdits(command);
        return;
      case 'newSession': {
        if (command.modeId) await this.inputs.requireAgent(command.modeId);
        const model = command.modelId ? await this.inputs.requireModel(command.modelId) : null;
        const images = await this.sources.images.write(command.images);
        await vscode.commands.executeCommand('workbench.action.openChat');
        if (command.modeId) {
          await vscode.commands.executeCommand('workbench.action.chat.toggleAgentMode', {
            modeId: command.modeId
          });
        }
        if (model) await selectModel(model);
        await attachImages(images);
        await vscode.commands.executeCommand('workbench.action.chat.submit', {
          inputValue: command.text
        });
        return;
      }
      case 'setModelConfig': {
        const model = await this.inputs.requireModel(command.modelId);
        const option = model.options.find((candidate) => candidate.key === command.key);
        if (!option) throw new Error(`${model.name} has no ${command.key} setting`);
        if (
          command.value !== null &&
          !option.choices.some((choice) => choice.value === command.value)
        ) {
          throw new Error(`Unsupported ${option.title} value`);
        }
        await this.sources.settings.update(command.modelId, command.key, command.value);
        return;
      }
    }
  }

  private async decideEdits(command: Extract<Command, { kind: 'editDecision' }>): Promise<void> {
    const files = await this.sources.editedFiles(command.sessionId);
    if (command.path !== null && !files.includes(command.path)) {
      throw new Error('File is not part of this chat');
    }
    await focusChat(command.sessionId);
    if (command.path === null && command.decision === 'keep') {
      await vscode.commands.executeCommand('chatEditing.acceptAllFiles');
      return;
    }
    const action =
      command.decision === 'keep' ? 'chatEditing.acceptFile' : 'chatEditing.discardFile';
    for (const path of command.path === null ? files : [command.path]) {
      await vscode.commands.executeCommand(action, vscode.Uri.file(path));
    }
  }

  private async handoff(command: Extract<Command, { kind: 'handoff' }>): Promise<void> {
    const agents = await this.sources.agents();
    const handoff = agents
      .find((agent) => agent.id === command.agentId)
      ?.handoffs.find((item) => item.id === command.handoffId);
    if (!handoff) throw new Error('This handoff is no longer offered');
    await this.sources.checkpoints.submitting(command.sessionId, async () => {
      if (command.autopilot) await this.inputs.setPermission(command.sessionId, 'autopilot');
      else await focusChat(command.sessionId);
      const result = await vscode.commands.executeCommand<HandoffResult | undefined>(
        'workbench.action.chat.executeHandoff',
        {
          id: handoff.id,
          sessionResource: sessionResource(command.sessionId).toString(),
          sourceCustomAgent: command.agentId
        }
      );
      if (!result?.success) throw new Error(result?.error ?? 'VS Code could not run the handoff');
    });
    const target =
      agents.find((agent) => agent.id === handoff.agent) ??
      agents.find((agent) => agent.name === handoff.agent);
    if (target) this.sources.expectMode(command.sessionId, target.id);
  }

  private async editRequest(command: Extract<Command, { kind: 'editRequest' }>): Promise<void> {
    if (command.modeId) await this.inputs.requireAgent(command.modeId);
    const model = command.modelId ? await this.inputs.requireModel(command.modelId) : null;
    const detail = await this.sources.detail(command.sessionId);
    if (!detail) throw new Error('Chat not found');
    const images = await this.sources.images.write(command.images);
    await this.sources.checkpoints.restore(command.sessionId, command.requestId, false);
    await this.sources.checkpoints.submitting(command.sessionId, async () => {
      await this.inputs.change(command.sessionId, detail, {
        modeId: command.modeId,
        model,
        permission: command.permission
      });
      await submitChat(command.sessionId, command.text, images);
    });
  }
}
