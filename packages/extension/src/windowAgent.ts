import { randomUUID } from 'node:crypto';
import { basename, dirname } from 'node:path';

import type {
  Agent,
  Command,
  Model,
  Repository,
  SessionDetail,
  SessionWatch,
  WindowState
} from '@pocket-pilot/protocol';
import * as vscode from 'vscode';

import { agentFolders, agentUri } from './agents/agentFolders';
import { AgentSource } from './agents/agentSource';
import { Controller } from './control/controller';
import { folderRepository } from './git/repository';
import { ModelSettingsFile } from './models/modelSettings';
import { ModelSource } from './models/modelSource';
import { type ChatPaths, chatPaths } from './paths';
import { SessionStore } from './sessions/sessionStore';

const PUBLISH_DELAY_MS = 100;

export interface SessionUpdate {
  sessionId: string;
  detail: SessionDetail | null;
}

export class WindowAgent implements vscode.Disposable {
  readonly windowId: string;

  private readonly stateChanged = new vscode.EventEmitter<WindowState>();
  private readonly sessionChanged = new vscode.EventEmitter<SessionUpdate>();
  private readonly subscriptions: vscode.Disposable[] = [this.stateChanged, this.sessionChanged];
  private readonly store: SessionStore;
  private readonly agentSource: AgentSource;
  private readonly modelSource: ModelSource;
  private readonly controller: Controller;
  private readonly paths: ChatPaths;
  private readonly detailQueues = new Map<string, Promise<void>>();
  private watches = new Map<string, number>();
  private repositories: Repository[] = [];
  private agents: Agent[] = [];
  private models: Model[] = [];
  private readonly versions = { agents: 0, models: 0, repositories: 0 };
  private publishTimer: NodeJS.Timeout | undefined;

  readonly onDidChangeState = this.stateChanged.event;
  readonly onDidChangeSession = this.sessionChanged.event;

  constructor(
    context: vscode.ExtensionContext,
    private readonly report: (message: string) => void
  ) {
    this.paths = chatPaths(context);
    this.windowId = context.storageUri
      ? basename(dirname(context.storageUri.fsPath))
      : `empty-${randomUUID()}`;
    this.store = new SessionStore(
      { sessions: this.paths.sessions, transcripts: this.paths.transcripts },
      report
    );
    this.agentSource = new AgentSource(agentUri(this.paths), report);
    const settings = new ModelSettingsFile(this.paths.modelSettings);
    this.modelSource = new ModelSource(this.paths.debugLogs, settings, report);
    this.controller = new Controller({
      models: () => Promise.resolve(this.models),
      agents: () => Promise.resolve(this.agents),
      settings
    });
    this.subscriptions.push(
      this.modelSource,
      { dispose: () => this.agentSource.dispose() },
      { dispose: () => this.store.dispose() },
      { dispose: () => clearTimeout(this.publishTimer) },
      this.modelSource.onDidChange(() => void this.refreshModels()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.agentSource.setFolders(agentFolders(this.paths));
        void this.refreshRepositories();
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('chat.agentFilesLocations')) {
          this.agentSource.setFolders(agentFolders(this.paths));
        }
      })
    );
    this.agentSource.onDidChange(() => void this.refreshAgents());
    this.store.onDidChange((sessionId) => this.onSessionChange(sessionId));
  }

  async start(): Promise<void> {
    this.agentSource.setFolders(agentFolders(this.paths));
    await Promise.all([
      this.store.start(),
      this.refreshAgents(),
      this.refreshModels(),
      this.refreshRepositories()
    ]);
  }

  state(): WindowState {
    return {
      windowId: this.windowId,
      name: vscode.workspace.name ?? 'Empty window',
      repositories: this.repositories,
      sessions: this.store.summaries(),
      agents: this.agents,
      models: this.models
    };
  }

  setWatches(watches: readonly SessionWatch[]): void {
    const next = new Map(watches.map((watch) => [watch.sessionId, watch.limit]));
    const changed = [...next].filter(([sessionId, limit]) => this.watches.get(sessionId) !== limit);
    this.watches = next;
    for (const [sessionId] of changed) this.pushDetail(sessionId);
  }

  run(command: Command): Promise<void> {
    if ('sessionId' in command && !this.store.summaries().some((s) => s.id === command.sessionId)) {
      return Promise.reject(new Error('Unknown session'));
    }
    return this.controller.run(command);
  }

  dispose(): void {
    for (const subscription of this.subscriptions) subscription.dispose();
  }

  private onSessionChange(sessionId: string | null): void {
    if (sessionId === null) {
      this.schedulePublish();
      for (const watched of this.watches.keys()) this.pushDetail(watched);
      return;
    }
    if (this.watches.has(sessionId)) this.pushDetail(sessionId);
  }

  private pushDetail(sessionId: string): void {
    const previous = this.detailQueues.get(sessionId) ?? Promise.resolve();
    const next = previous
      .then(async () => {
        const limit = this.watches.get(sessionId);
        if (limit === undefined) return;
        const detail = await this.store.detail(sessionId, limit);
        if (this.watches.has(sessionId)) this.sessionChanged.fire({ sessionId, detail });
      })
      .catch((error: unknown) => this.report(`Session detail failed: ${String(error)}`))
      .finally(() => {
        if (this.detailQueues.get(sessionId) === next) this.detailQueues.delete(sessionId);
      });
    this.detailQueues.set(sessionId, next);
  }

  private schedulePublish(): void {
    if (this.publishTimer) return;
    this.publishTimer = setTimeout(() => {
      this.publishTimer = undefined;
      this.stateChanged.fire(this.state());
    }, PUBLISH_DELAY_MS);
  }

  private async refreshAgents(): Promise<void> {
    const version = ++this.versions.agents;
    const agents = await this.agentSource.list();
    if (version !== this.versions.agents) return;
    this.agents = agents;
    this.schedulePublish();
  }

  private async refreshModels(): Promise<void> {
    const version = ++this.versions.models;
    const models = await this.modelSource.list().catch((error: unknown) => {
      this.report(`Cannot list models: ${String(error)}`);
      return null;
    });
    if (!models || version !== this.versions.models) return;
    this.models = models;
    this.schedulePublish();
  }

  private async refreshRepositories(): Promise<void> {
    const version = ++this.versions.repositories;
    const folders = (vscode.workspace.workspaceFolders ?? []).filter(
      (folder) => folder.uri.scheme === 'file'
    );
    const repositories = await Promise.all(
      folders.map((folder) => folderRepository(folder.uri.fsPath))
    );
    if (version !== this.versions.repositories) return;
    this.repositories = [
      ...new Map(repositories.map((repository) => [repository.key, repository])).values()
    ];
    this.schedulePublish();
  }
}
