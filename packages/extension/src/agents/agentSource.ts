import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import type { Agent } from '@pocket-pilot/protocol';
import type { FSWatcher } from 'chokidar';

import { watchTargets } from '../fsWatch';
import { BUILTIN_AGENTS, isAgentFile, parseAgentFile } from './agentFiles';

export interface AgentFolder {
  path: string;
  builtin: boolean;
  children?: RegExp;
}

type Listener = () => void;
type IdFor = (path: string) => string;

async function agentDirectories(folder: AgentFolder): Promise<string[]> {
  const pattern = folder.children;
  if (!pattern) return [folder.path];
  const entries = await readdir(folder.path, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory() && pattern.test(entry.name))
    .map((entry) => join(folder.path, entry.name));
}

async function readDirectory(directory: string, builtin: boolean, idFor: IdFor): Promise<Agent[]> {
  const names = await readdir(directory).catch(() => []);
  const parsed = await Promise.all(
    names
      .filter((fileName) => isAgentFile(directory, fileName))
      .map(async (fileName) => {
        const path = join(directory, fileName);
        const text = await readFile(path, 'utf8').catch(() => null);
        if (text === null) return null;
        return parseAgentFile({ id: idFor(path), fileName, builtin }, text);
      })
  );
  return parsed.filter((agent) => agent !== null);
}

export async function readAgents(folders: readonly AgentFolder[], idFor: IdFor): Promise<Agent[]> {
  const found = await Promise.all(
    folders.map(async (folder) => {
      const directories = await agentDirectories(folder);
      const agents = await Promise.all(
        directories.map((directory) => readDirectory(directory, folder.builtin, idFor))
      );
      return agents.flat();
    })
  );
  const custom = [...new Map(found.flat().map((agent) => [agent.id, agent])).values()].sort(
    (a, b) => Number(b.builtin) - Number(a.builtin) || a.name.localeCompare(b.name)
  );
  return [...BUILTIN_AGENTS, ...custom];
}

function folderKey(folders: readonly AgentFolder[]): string {
  return JSON.stringify(
    folders.map((folder) => [folder.path, folder.builtin, String(folder.children)])
  );
}

export class AgentSource {
  private readonly listeners = new Set<Listener>();
  private folders: readonly AgentFolder[] = [];
  private watcher: FSWatcher | null = null;

  constructor(
    private readonly idFor: IdFor,
    private readonly report: (message: string) => void
  ) {}

  onDidChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setFolders(folders: readonly AgentFolder[]): void {
    const next = [...new Map(folders.map((folder) => [folder.path, folder])).values()];
    if (folderKey(next) === folderKey(this.folders)) return;
    this.folders = next;
    void this.watcher?.close();
    this.watcher = watchTargets(
      next.map((folder) => ({
        path: folder.path,
        depth: folder.children ? 1 : 0,
        children: folder.children
      })),
      (_event, path) => {
        if (isAgentFile(dirname(path), basename(path))) this.emit();
      },
      (error) => this.report(`Agent watcher failed: ${String(error)}`),
      () => this.emit()
    );
    this.emit();
  }

  list(): Promise<Agent[]> {
    return readAgents(this.folders, this.idFor);
  }

  dispose(): void {
    this.listeners.clear();
    void this.watcher?.close();
    this.watcher = null;
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
