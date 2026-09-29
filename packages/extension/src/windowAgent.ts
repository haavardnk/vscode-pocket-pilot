import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import type {
  Agent,
  Command,
  HookEvent,
  Model,
  Query,
  QueryResult,
  Repository,
  SessionDetail,
  SessionWatch,
  WindowState
} from '@pocket-pilot/protocol';
import * as vscode from 'vscode';

import { agentFolders, agentUri } from './agents/agentFolders';
import { AgentSource } from './agents/agentSource';
import { EMPTY_WINDOW } from './cluster/hub';
import type { TerminalUpdate } from './cluster/localWindow';
import { CodeService } from './code/codeService';
import { EditChanges } from './code/editChanges';
import { type Blob, MAX_FILE_BYTES, readBlob } from './code/files';
import { type CodeFolder, codeFolder } from './code/folders';
import { LanguageIndex } from './code/languageIndex';
import { SessionChanges } from './code/sessionChanges';
import { ChatImages } from './control/chatImages';
import { CheckpointCommands } from './control/checkpointCommands';
import { Controller } from './control/controller';
import { RemovalPrompt } from './control/removalPrompt';
import { BranchService, isBranchCommand } from './git/branchService';
import { GitStatusSource } from './git/gitStatus';
import { folderRepository } from './git/repository';
import { ModelSettingsFile } from './models/modelSettings';
import { ModelSource } from './models/modelSource';
import { type ChatPaths, chatPaths } from './paths';
import { Checkpoints } from './sessions/checkpoints';
import { EditingSessions } from './sessions/editingState';
import { FlagStore } from './sessions/flagStore';
import { LiveEdits } from './sessions/liveEdits';
import { LiveMirror } from './sessions/liveMirror';
import { SessionStore } from './sessions/sessionStore';
import { liveMirrorMode, SECTION } from './settings';
import { isTerminalCommand, TerminalService } from './terminals/terminalService';
import {
  currentWorkspace,
  isWindowCommand,
  listOpenTargets,
  runWindowCommand
} from './windows/windowService';

const PUBLISH_DELAY_MS = 100;
const EXPORT_COMMAND = 'workbench.action.chat.export';

export interface SessionUpdate {
  sessionId: string;
  detail: SessionDetail | null;
}

async function currentBlob(path: string): Promise<Blob> {
  const document = vscode.workspace.textDocuments.find(
    (candidate) => candidate.uri.scheme === 'file' && candidate.uri.fsPath === path
  );
  if (!document) return (await readBlob(path)).blob;
  const content = Buffer.from(document.getText());
  return content.length > MAX_FILE_BYTES ? 'tooLarge' : content;
}

export class WindowAgent implements vscode.Disposable {
  readonly windowId: string;

  private readonly stateChanged = new vscode.EventEmitter<WindowState>();
  private readonly sessionChanged = new vscode.EventEmitter<SessionUpdate>();
  private readonly terminalChanged = new vscode.EventEmitter<TerminalUpdate>();
  private readonly subscriptions: vscode.Disposable[] = [
    this.stateChanged,
    this.sessionChanged,
    this.terminalChanged
  ];
  private readonly store: SessionStore;
  private readonly flags: FlagStore;
  private readonly agentSource: AgentSource;
  private readonly modelSource: ModelSource;
  private readonly controller: Controller;
  private readonly code: CodeService;
  private readonly edits: LiveEdits;
  private readonly editChanges: EditChanges;
  private readonly checkpoints: Checkpoints;
  private readonly removalPrompt: RemovalPrompt;
  private readonly images: ChatImages;
  private readonly mirror: LiveMirror;
  private readonly terminals: TerminalService;
  private readonly git: GitStatusSource;
  private readonly branches: BranchService;
  private readonly paths: ChatPaths;
  private readonly detailQueues = new Map<string, Promise<void>>();
  private watches = new Map<string, number>();
  private repositories: Repository[] = [];
  private folders: CodeFolder[] = [];
  private folderRepositories = new Map<string, string>();
  private gitKey = '';
  private agents: Agent[] = [];
  private models: Model[] = [];
  private readonly versions = { agents: 0, models: 0, repositories: 0 };
  private publishTimer: NodeJS.Timeout | undefined;

  readonly onDidChangeState = this.stateChanged.event;
  readonly onDidChangeSession = this.sessionChanged.event;
  readonly onDidChangeTerminal = this.terminalChanged.event;

  constructor(
    context: vscode.ExtensionContext,
    private readonly report: (message: string) => void
  ) {
    this.paths = chatPaths(context);
    this.windowId = context.storageUri
      ? basename(dirname(context.storageUri.fsPath))
      : `${EMPTY_WINDOW}${randomUUID()}`;
    this.store = new SessionStore(
      { sessions: this.paths.sessions, transcripts: this.paths.transcripts },
      report
    );
    this.flags = new FlagStore(this.paths.stateDatabase, report);
    this.agentSource = new AgentSource(agentUri(this.paths), report);
    const settings = new ModelSettingsFile(this.paths.modelSettings);
    this.modelSource = new ModelSource(this.paths.debugLogs, settings, report);
    this.edits = new LiveEdits(currentBlob);
    this.mirror = new LiveMirror({
      file: context.storageUri
        ? join(context.storageUri.fsPath, 'live-export.json')
        : join(context.globalStorageUri.fsPath, `live-export-${this.windowId}.json`),
      exportTo: async (file) => {
        await vscode.commands.executeCommand(EXPORT_COMMAND, vscode.Uri.file(file));
      },
      active: () =>
        this.store
          .summaries()
          .some(
            (summary) =>
              this.watches.has(summary.id) &&
              (summary.status === 'running' || summary.status === 'needsInput')
          ),
      apply: (root, at) => this.store.applyExport(root, at),
      report
    });
    const languages = new LanguageIndex();
    const editing = new EditingSessions(this.paths.editingSessions);
    this.editChanges = new EditChanges(editing, this.edits);
    this.checkpoints = new Checkpoints(this.paths.editingSessions, editing, report);
    this.removalPrompt = new RemovalPrompt(context.globalState);
    this.images = new ChatImages(join(context.globalStorageUri.fsPath, 'chat-images'));
    const sessionChanges = new SessionChanges({
      folders: () => this.folders,
      language: (path) => languages.resolve(path),
      editing,
      editedPaths: (sessionId) => this.store.editedPaths(sessionId),
      detail: (sessionId, limit) => this.store.detail(sessionId, limit),
      current: currentBlob,
      live: this.edits,
      edits: this.editChanges,
      home: homedir()
    });
    this.code = new CodeService({
      folders: () => this.folders,
      language: (path) => languages.resolve(path),
      sessions: sessionChanges
    });
    this.controller = new Controller({
      models: () => Promise.resolve(this.models),
      agents: () => Promise.resolve(this.agents),
      detail: (sessionId) => this.store.detail(sessionId, 1),
      image: (sessionId, requestId, imageId) =>
        this.store.requestImage(sessionId, requestId, imageId),
      editedFiles: (sessionId) => sessionChanges.paths(sessionId),
      expectFlags: (sessionId, flags) => this.flags.expect(sessionId, flags),
      expectQueue: (sessionId, items) => this.store.expectQueue(sessionId, items),
      expectPermission: (sessionId, level) => this.store.expectPermission(sessionId, level),
      expectMode: (sessionId, modeId) => this.store.expectMode(sessionId, modeId),
      expectModel: (sessionId, modelId) => this.store.expectModel(sessionId, modelId),
      checkpoints: new CheckpointCommands({
        requests: async (sessionId) => {
          const detail = await this.store.detail(sessionId, Infinity);
          return detail ? (await this.checkpoints.decorate(detail)).requests : [];
        },
        disabled: (sessionId) => this.checkpoints.disabled(sessionId),
        expectRestored: (sessionId, requestIds) => this.checkpoints.expect(sessionId, requestIds),
        expectRemoved: (sessionId, requestId) => this.store.expectRemoved(sessionId, requestId),
        prompt: this.removalPrompt
      }),
      images: this.images,
      canOrganize: this.paths.stateDatabase !== null,
      settings
    });
    this.terminals = new TerminalService(() => this.folders, report);
    this.git = new GitStatusSource(report);
    this.branches = new BranchService(() => this.folders, this.git);
    this.subscriptions.push(
      languages,
      this.terminals,
      this.git,
      this.git.onDidChange(() => this.publishGit()),
      this.terminals.onDidChange(() => this.schedulePublish()),
      this.terminals.onDidUpdate((update) => this.terminalChanged.fire(update)),
      this.terminals.onDidLink((sessionId) => {
        if (this.watches.has(sessionId)) this.pushDetail(sessionId);
      }),
      this.modelSource,
      { dispose: () => this.agentSource.dispose() },
      { dispose: () => this.store.dispose() },
      { dispose: () => this.flags.dispose() },
      { dispose: () => this.mirror.dispose() },
      { dispose: () => this.checkpoints.dispose() },
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
        if (event.affectsConfiguration(`${SECTION}.liveMirror`)) void this.refreshMirror();
      })
    );
    this.agentSource.onDidChange(() => void this.refreshAgents());
    this.store.onDidChange((sessionId) => this.onSessionChange(sessionId));
    this.checkpoints.onDidChange((sessionId) => {
      if (this.watches.has(sessionId)) this.pushDetail(sessionId);
    });
    this.flags.onDidChange(() => this.schedulePublish());
  }

  async start(): Promise<void> {
    this.agentSource.setFolders(agentFolders(this.paths));
    this.checkpoints.start();
    await Promise.all([
      this.store.start(),
      this.flags.start(),
      this.removalPrompt
        .recover()
        .catch((error: unknown) => this.report(`Cannot restore chat setting: ${String(error)}`)),
      this.images
        .prune()
        .catch((error: unknown) => this.report(`Cannot clean up photos: ${String(error)}`)),
      this.refreshAgents(),
      this.refreshModels(),
      this.refreshRepositories(),
      this.refreshMirror(),
      this.git.start()
    ]);
  }

  state(): WindowState {
    return {
      windowId: this.windowId,
      name: vscode.workspace.name ?? 'Empty window',
      workspace: currentWorkspace(),
      repositories: this.repositories,
      folders: this.folders.map(({ id, name, root }) => ({
        id,
        name,
        repositoryKey: this.folderRepositories.get(id) ?? null,
        git: this.git.statusFor(root)
      })),
      sessions: this.store
        .summaries()
        .map((summary) => ({ ...summary, ...this.flags.flags(summary.id) })),
      terminals: this.terminals.summaries(),
      canOrganize: this.paths.stateDatabase !== null,
      agents: this.agents,
      models: this.models
    };
  }

  setWatches(watches: readonly SessionWatch[]): void {
    const next = new Map(watches.map((watch) => [watch.sessionId, watch.limit]));
    const changed = [...next].filter(([sessionId, limit]) => this.watches.get(sessionId) !== limit);
    this.watches = next;
    for (const [sessionId] of changed) this.pushDetail(sessionId);
    this.mirror.wake();
  }

  setTerminalWatches(terminalIds: readonly string[]): void {
    this.terminals.watch(terminalIds);
  }

  async run(command: Command): Promise<void> {
    if (isWindowCommand(command)) {
      await runWindowCommand(command, this.report);
      return;
    }
    if (isBranchCommand(command)) {
      await this.branches.run(command);
      return;
    }
    if (isTerminalCommand(command)) {
      this.terminals.run(command);
      return;
    }
    if ('sessionId' in command && !this.store.summaries().some((s) => s.id === command.sessionId)) {
      throw new Error('Unknown session');
    }
    await this.controller.run(command);
    this.mirror.poke();
  }

  async query(query: Query): Promise<QueryResult> {
    if (query.kind === 'openTargets') return listOpenTargets(this.report);
    if (query.kind === 'branches') return this.branches.list(query);
    if (query.kind === 'requestImage') {
      const image = await this.store.requestImage(query.sessionId, query.requestId, query.imageId);
      if (!image) throw new Error('Photo is no longer available');
      return image;
    }
    return this.code.query(query);
  }

  async hook(event: HookEvent): Promise<void> {
    this.terminals.hook(event);
    await Promise.all([this.store.hook(event), this.edits.hook(event)]);
    this.mirror.poke();
  }

  dispose(): void {
    for (const subscription of this.subscriptions) subscription.dispose();
  }

  private onSessionChange(sessionId: string | null): void {
    this.mirror.wake();
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
        const decorated =
          detail &&
          (await this.editChanges.decorate(
            await this.checkpoints.decorate(this.terminals.decorate(detail))
          ));
        if (!this.watches.has(sessionId)) return;
        this.sessionChanged.fire({ sessionId, detail: decorated });
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

  private publishGit(): void {
    const key = JSON.stringify(this.folders.map((folder) => this.git.statusFor(folder.root)));
    if (key === this.gitKey) return;
    this.gitKey = key;
    this.schedulePublish();
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

  private async refreshMirror(): Promise<void> {
    const commands = await vscode.commands.getCommands(true);
    this.mirror.setEnabled(liveMirrorMode() === 'full' && commands.includes(EXPORT_COMMAND));
  }

  private async refreshRepositories(): Promise<void> {
    const version = ++this.versions.repositories;
    const folders = (vscode.workspace.workspaceFolders ?? []).filter(
      (folder) => folder.uri.scheme === 'file'
    );
    this.folders = folders.map((folder) => codeFolder(folder.name, folder.uri.fsPath));
    this.schedulePublish();
    const resolved = await Promise.all(
      this.folders.map(async ({ id, root }) => ({ id, repository: await folderRepository(root) }))
    );
    if (version !== this.versions.repositories) return;
    this.folderRepositories = new Map(resolved.map(({ id, repository }) => [id, repository.key]));
    this.repositories = [
      ...new Map(resolved.map(({ repository }) => [repository.key, repository])).values()
    ];
    this.schedulePublish();
  }
}
