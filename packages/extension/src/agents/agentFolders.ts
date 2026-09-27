import { homedir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';

import * as vscode from 'vscode';

import type { ChatPaths } from '../paths';
import type { AgentFolder } from './agentSource';

const WORKSPACE_FOLDERS = ['.github/agents', '.claude/agents'];
const HOME_FOLDERS = ['.copilot/agents', '.claude/agents'];
const COPILOT_AGENT_FOLDERS = /-agent$/;

function resolveLocation(location: string, roots: readonly string[]): string[] {
  if (location === '~' || location.startsWith('~/')) return [join(homedir(), location.slice(1))];
  if (isAbsolute(location)) return [location];
  return roots.map((root) => join(root, location));
}

function custom(path: string): AgentFolder {
  return { path, builtin: false };
}

export function agentFolders(paths: ChatPaths): AgentFolder[] {
  const roots = (vscode.workspace.workspaceFolders ?? [])
    .filter((folder) => folder.uri.scheme === 'file')
    .map((folder) => folder.uri.fsPath);
  const configured = Object.entries(
    vscode.workspace
      .getConfiguration('chat')
      .get<Record<string, boolean>>('agentFilesLocations', {})
  );
  const disabled = new Set(
    configured.filter(([, on]) => !on).flatMap(([location]) => resolveLocation(location, roots))
  );
  const folders = [
    ...roots.flatMap((root) => WORKSPACE_FOLDERS.map((folder) => join(root, folder))),
    ...HOME_FOLDERS.map((folder) => join(homedir(), folder)),
    ...configured.filter(([, on]) => on).flatMap(([location]) => resolveLocation(location, roots)),
    join(paths.userDir, 'prompts')
  ]
    .filter((folder) => !disabled.has(folder))
    .map(custom);
  return [
    ...folders,
    { path: paths.copilotStorage, builtin: true, children: COPILOT_AGENT_FOLDERS }
  ];
}

export function agentUri(paths: ChatPaths): (path: string) => string {
  return (path) => {
    const inner = relative(paths.userDir, path);
    const userData = !inner.startsWith('..') && !isAbsolute(inner);
    const uri = vscode.Uri.file(path);
    return (userData ? uri.with({ scheme: 'vscode-userdata' }) : uri).toString();
  };
}
