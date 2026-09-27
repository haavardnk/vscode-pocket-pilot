import type { Agent, Command, Model, PermissionLevel, SessionDetail } from '@pocket-pilot/protocol';
import * as vscode from 'vscode';

import type { ModelSettingsFile } from '../models/modelSettings';
import {
  answersError,
  confirmationPrompt,
  pendingQuestions,
  PERMISSION_COMMANDS,
  requirePendingElicitation
} from './interactions';

export interface ControllerSources {
  models: () => Promise<Model[]>;
  agents: () => Promise<Agent[]>;
  detail: (sessionId: string) => Promise<SessionDetail | null>;
  editedFiles: (sessionId: string) => Promise<string[]>;
  expectPermission: (sessionId: string, level: PermissionLevel) => void;
  settings: ModelSettingsFile;
}

export function sessionResource(sessionId: string): vscode.Uri {
  return vscode.Uri.from({
    scheme: 'vscode-chat-session',
    authority: 'local',
    path: `/${Buffer.from(sessionId).toString('base64url')}`
  });
}

export class Controller {
  constructor(private readonly sources: ControllerSources) {}

  async run(command: Command): Promise<void> {
    switch (command.kind) {
      case 'send':
        await this.focus(command.sessionId);
        await vscode.commands.executeCommand('workbench.action.chat.submit', {
          inputValue: command.text,
          ...(command.delivery ? { acceptInputOptions: { queue: command.delivery } } : {})
        });
        return;
      case 'stop':
        await this.focus(command.sessionId);
        await vscode.commands.executeCommand('workbench.action.chat.cancel');
        return;
      case 'setMode':
        await this.requireAgent(command.modeId);
        await vscode.commands.executeCommand('workbench.action.chat.toggleAgentMode', {
          modeId: command.modeId,
          sessionResource: sessionResource(command.sessionId)
        });
        return;
      case 'setModel':
        await this.selectModel(await this.requireModel(command.modelId));
        return;
      case 'toolDecision':
        await this.focus(command.sessionId);
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
        await this.submit(command.sessionId, prompt);
        return;
      }
      case 'acceptElicitation':
        requirePendingElicitation(await this.sources.detail(command.sessionId));
        await this.focus(command.sessionId);
        await vscode.commands.executeCommand('workbench.action.chat.acceptElicitation');
        return;
      case 'setPermission':
        await this.submit(command.sessionId, PERMISSION_COMMANDS[command.level]);
        this.sources.expectPermission(command.sessionId, command.level);
        return;
      case 'editDecision':
        await this.decideEdits(command);
        return;
      case 'newSession': {
        if (command.modeId) await this.requireAgent(command.modeId);
        const model = command.modelId ? await this.requireModel(command.modelId) : null;
        await vscode.commands.executeCommand('workbench.action.openChat');
        if (command.modeId) {
          await vscode.commands.executeCommand('workbench.action.chat.toggleAgentMode', {
            modeId: command.modeId
          });
        }
        if (model) await this.selectModel(model);
        await vscode.commands.executeCommand('workbench.action.chat.submit', {
          inputValue: command.text
        });
        return;
      }
      case 'setModelConfig': {
        const model = await this.requireModel(command.modelId);
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

  private async focus(sessionId: string): Promise<void> {
    await vscode.commands.executeCommand('vscode.open', sessionResource(sessionId));
  }

  private async decideEdits(command: Extract<Command, { kind: 'editDecision' }>): Promise<void> {
    const files = await this.sources.editedFiles(command.sessionId);
    if (command.path !== null && !files.includes(command.path)) {
      throw new Error('File is not part of this chat');
    }
    await this.focus(command.sessionId);
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

  private async submit(sessionId: string, text: string): Promise<void> {
    await this.focus(sessionId);
    await vscode.commands.executeCommand('workbench.action.chat.submit', { inputValue: text });
  }

  private async requireAgent(modeId: string): Promise<void> {
    const agents = await this.sources.agents();
    if (!agents.some((agent) => agent.id === modeId)) throw new Error('Unknown agent');
  }

  private async requireModel(modelId: string): Promise<Model> {
    const model = (await this.sources.models()).find((candidate) => candidate.id === modelId);
    if (!model) throw new Error('Unknown model');
    return model;
  }

  private async selectModel(model: Model): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.chat.changeModel', {
      vendor: model.vendor,
      id: model.id.slice(model.vendor.length + 1),
      family: model.family
    });
  }
}
