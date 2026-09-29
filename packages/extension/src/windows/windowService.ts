import { homedir } from 'node:os';

import type { Command, OpenTarget, WindowResult } from '@pocket-pilot/protocol';
import * as vscode from 'vscode';

import { errorMessage } from '../errors';
import { SECTION } from '../settings';
import { type OpenCandidate, openTargets } from './openTargets';
import { scanRoots } from './projectRoots';
import { parseRecents, type RecentEntry } from './recentFolders';

const CLOSE_DELAY_MS = 250;
const RECENTS_COMMAND = '_workbench.getRecentlyOpened';

type Report = (message: string) => void;

export type WindowCommand = Extract<Command, { kind: 'closeWindow' | 'openWindow' }>;

export function isWindowCommand(command: Command): command is WindowCommand {
  return command.kind === 'closeWindow' || command.kind === 'openWindow';
}

export function currentWorkspace(): string | null {
  const file = vscode.workspace.workspaceFile;
  if (file) return file.toString();
  const folders = vscode.workspace.workspaceFolders ?? [];
  const [folder] = folders;
  return folders.length === 1 && folder ? folder.uri.toString() : null;
}

function candidate(uri: vscode.Uri, kind: OpenTarget['kind']): OpenCandidate {
  return { id: uri.toString(), fsPath: uri.fsPath, kind };
}

function projectRoots(): string[] {
  const roots = vscode.workspace.getConfiguration(SECTION).get<unknown>('projectRoots');
  return Array.isArray(roots)
    ? roots.filter((root): root is string => typeof root === 'string')
    : [];
}

async function recentEntries(report: Report): Promise<RecentEntry[]> {
  try {
    return parseRecents(await vscode.commands.executeCommand<unknown>(RECENTS_COMMAND));
  } catch (error) {
    report(`Could not read recent folders: ${errorMessage(error)}`);
    return [];
  }
}

export async function listOpenTargets(report: Report): Promise<WindowResult> {
  const home = homedir();
  const [recent, projects] = await Promise.all([
    recentEntries(report),
    scanRoots(projectRoots(), home)
  ]);
  return openTargets(
    recent.map((entry) =>
      candidate(
        vscode.Uri.from({ scheme: 'file', authority: entry.authority, path: entry.path }),
        entry.kind
      )
    ),
    projects.map((path) => candidate(vscode.Uri.file(path), 'folder')),
    home
  );
}

async function openWindow(target: string, report: Report): Promise<void> {
  const { recent, projects } = await listOpenTargets(report);
  const listed = [...recent, ...projects].find((candidate) => candidate.id === target);
  if (!listed) throw new Error('This folder is no longer in the list');
  await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.parse(listed.id), {
    forceNewWindow: true
  });
}

export async function runWindowCommand(command: WindowCommand, report: Report): Promise<void> {
  if (command.kind === 'openWindow') {
    await openWindow(command.target, report);
    return;
  }
  setTimeout(() => {
    vscode.commands
      .executeCommand('workbench.action.closeWindow')
      .then(undefined, (error: unknown) =>
        report(`Could not close the window: ${errorMessage(error)}`)
      );
  }, CLOSE_DELAY_MS);
}
