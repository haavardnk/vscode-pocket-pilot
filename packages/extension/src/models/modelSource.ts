import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';

import type { Model } from '@pocket-pilot/protocol';
import type { FSWatcher } from 'chokidar';
import * as vscode from 'vscode';

import { watchTargets } from '../fsWatch';
import { buildModels } from './catalog';
import { type CopilotModelInfo, parseCopilotModels } from './copilotModels';
import type { ModelSettingsFile } from './modelSettings';

const CATALOG = 'models.json';

interface CatalogFile {
  file: string;
  modified: number;
}

async function newestCatalog(debugLogs: string): Promise<CatalogFile | null> {
  const folders = await readdir(debugLogs).catch(() => []);
  const candidates = await Promise.all(
    folders.map(async (folder) => {
      const file = join(debugLogs, folder, CATALOG);
      return stat(file).then(
        (info) => ({ file, modified: info.mtimeMs }),
        () => null
      );
    })
  );
  const newest = candidates
    .filter((candidate) => candidate !== null)
    .sort((a, b) => b.modified - a.modified)[0];
  return newest ?? null;
}

export class ModelSource implements vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  private readonly subscriptions: vscode.Disposable[] = [this.changed];
  private readonly watcher: FSWatcher;
  private copilot: (CatalogFile & { models: CopilotModelInfo[] }) | null = null;

  readonly onDidChange = this.changed.event;

  constructor(
    private readonly debugLogs: string | null,
    private readonly settings: ModelSettingsFile,
    private readonly report: (message: string) => void
  ) {
    this.subscriptions.push(vscode.lm.onDidChangeChatModels(() => this.changed.fire()));
    const targets = [{ path: settings.path, depth: 0 }];
    if (debugLogs) targets.push({ path: debugLogs, depth: 1 });
    this.watcher = watchTargets(
      targets,
      (_event, path) => {
        if (path === settings.path || basename(path) === CATALOG) this.changed.fire();
      },
      (error) => report(`Model watcher failed: ${String(error)}`),
      () => this.changed.fire()
    );
  }

  async list(): Promise<Model[]> {
    const [chatModels, copilot, settings] = await Promise.all([
      vscode.lm.selectChatModels(),
      this.copilotModels(),
      this.settings.read().catch((error: unknown) => {
        this.report(`Cannot read model settings: ${String(error)}`);
        return new Map();
      })
    ]);
    return buildModels(chatModels, copilot, settings);
  }

  dispose(): void {
    void this.watcher.close();
    for (const subscription of this.subscriptions) subscription.dispose();
  }

  private async copilotModels(): Promise<CopilotModelInfo[]> {
    if (!this.debugLogs) return [];
    const latest = await newestCatalog(this.debugLogs);
    if (!latest) return [];
    if (this.copilot?.file === latest.file && this.copilot.modified === latest.modified) {
      return this.copilot.models;
    }
    try {
      const models = parseCopilotModels(JSON.parse(await readFile(latest.file, 'utf8')));
      this.copilot = { ...latest, models };
      return models;
    } catch (error) {
      this.report(`Cannot read Copilot model catalog: ${String(error)}`);
      return this.copilot?.models ?? [];
    }
  }
}
