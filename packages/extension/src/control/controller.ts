import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import {
  type Agent,
  type Command,
  type Model,
  type PermissionLevel,
  PHONE_QUEUE_PREFIX,
  type QueuedRequest,
  queuePlan,
  type SessionDetail
} from '@pocket-pilot/protocol';
import * as vscode from 'vscode';

import type { ModelSettingsFile } from '../models/modelSettings';
import { withQueued } from '../sessions/queue';
import type { SessionFlags } from '../sessions/sessionFlags';
import {
  LOCAL_SESSION_AUTHORITY,
  LOCAL_SESSION_SCHEME,
  localSessionPath
} from '../sessions/sessionUri';
import {
  answersError,
  confirmationPrompt,
  pendingQuestions,
  PERMISSION_COMMANDS,
  requirePendingElicitation
} from './interactions';

const AGENT_SESSION_CONTEXT = 25;
const ARCHIVE_PROMPT_MS = 3000;

export interface ControllerSources {
  models: () => Promise<Model[]>;
  agents: () => Promise<Agent[]>;
  detail: (sessionId: string) => Promise<SessionDetail | null>;
  editedFiles: (sessionId: string) => Promise<string[]>;
  expectFlags: (sessionId: string, flags: Partial<SessionFlags>) => void;
  expectQueue: (sessionId: string, items: QueuedRequest[]) => void;
  expectPermission: (sessionId: string, level: PermissionLevel) => void;
  expectMode: (sessionId: string, modeId: string) => void;
  canOrganize: boolean;
  settings: ModelSettingsFile;
}

function sessionResource(sessionId: string): vscode.Uri {
  return vscode.Uri.from({
    scheme: LOCAL_SESSION_SCHEME,
    authority: LOCAL_SESSION_AUTHORITY,
    path: localSessionPath(sessionId)
  });
}

export class Controller {
  constructor(private readonly sources: ControllerSources) {}

  async run(command: Command): Promise<void> {
    switch (command.kind) {
      case 'send': {
        const before = command.delivery ? await this.sources.detail(command.sessionId) : null;
        await this.focus(command.sessionId);
        await vscode.commands.executeCommand('workbench.action.chat.submit', {
          inputValue: command.text,
          ...(command.delivery ? { acceptInputOptions: { queue: command.delivery } } : {})
        });
        if (command.delivery && (before?.status === 'running' || before?.status === 'needsInput')) {
          this.sources.expectQueue(
            command.sessionId,
            withQueued(before.queued, {
              id: PHONE_QUEUE_PREFIX + randomUUID(),
              delivery: command.delivery,
              text: command.text,
              attachments: 0
            })
          );
        }
        return;
      }
      case 'setQueue':
        await this.setQueue(command);
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
        this.sources.expectMode(command.sessionId, command.modeId);
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
      case 'setPinned':
        this.requireOrganize();
        await this.agentSessionCommand(
          command.pinned ? 'agentSession.pin' : 'agentSession.unpin',
          command.sessionId
        );
        this.sources.expectFlags(command.sessionId, { pinned: command.pinned });
        return;
      case 'setArchived':
        this.requireOrganize();
        await this.setArchived(command.sessionId, command.archived);
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

  private requireOrganize(): void {
    if (!this.sources.canOrganize) {
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

  private async setArchived(sessionId: string, archived: boolean): Promise<void> {
    const done = this.agentSessionCommand(
      archived ? 'agentSession.archive' : 'agentSession.unarchive',
      sessionId
    ).then(() => this.sources.expectFlags(sessionId, { archived }));
    const prompted = delay(ARCHIVE_PROMPT_MS, true, { ref: false });
    if (await Promise.race([done.then(() => false), prompted])) {
      throw new Error('VS Code asks what to do with the pending edits of this chat');
    }
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

  private async setQueue(command: Extract<Command, { kind: 'setQueue' }>): Promise<void> {
    const current = (await this.sources.detail(command.sessionId))?.queued;
    if (!current) throw new Error('Chat not found');
    const plan = queuePlan(current, command.expected, command.queue);
    if (plan.kind === 'remove') {
      for (const id of plan.ids) {
        await vscode.commands.executeCommand('workbench.action.chat.removePendingRequest', {
          sessionResource: sessionResource(command.sessionId),
          pendingRequestId: id
        });
      }
      this.sources.expectQueue(
        command.sessionId,
        current.filter((item) => !plan.ids.includes(item.id))
      );
      return;
    }
    await this.focus(command.sessionId);
    await vscode.commands.executeCommand('workbench.action.chat.removeAllPendingRequests');
    for (const item of command.queue) {
      await vscode.commands.executeCommand('workbench.action.chat.submit', {
        inputValue: item.text,
        acceptInputOptions: { queue: item.delivery }
      });
    }
    this.sources.expectQueue(
      command.sessionId,
      command.queue.map((item) => ({
        id: PHONE_QUEUE_PREFIX + randomUUID(),
        delivery: item.delivery,
        text: item.text,
        attachments: 0
      }))
    );
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
