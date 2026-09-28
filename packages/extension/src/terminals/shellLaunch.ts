import { basename } from 'node:path';

import * as vscode from 'vscode';

import { asRecord, asString } from '../json';

export interface ShellLaunch {
  name: string;
  file: string;
  args: string[];
  env: Record<string, string>;
}

const PLATFORMS: Partial<Record<NodeJS.Platform, string>> = {
  darwin: 'osx',
  linux: 'linux',
  win32: 'windows'
};

function profileArgs(terminal: vscode.WorkspaceConfiguration, platform: string): string[] | null {
  const name = terminal.get<string>(`defaultProfile.${platform}`);
  if (!name) return null;
  const args: unknown = asRecord(asRecord(terminal.get(`profiles.${platform}`))[name]).args;
  if (typeof args === 'string') return [args];
  return Array.isArray(args) ? args.flatMap((arg: unknown) => asString(arg) ?? []) : null;
}

function launchEnv(
  terminal: vscode.WorkspaceConfiguration,
  platform: string
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith('ELECTRON_') && !key.startsWith('VSCODE_')) {
      env[key] = value;
    }
  }
  Object.assign(env, {
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    TERM_PROGRAM: 'vscode',
    TERM_PROGRAM_VERSION: vscode.version
  });
  for (const [key, value] of Object.entries(asRecord(terminal.get(`env.${platform}`)))) {
    if (value === null) delete env[key];
    else if (typeof value === 'string') env[key] = value;
  }
  return env;
}

export function shellLaunch(): ShellLaunch {
  const platform = PLATFORMS[process.platform] ?? 'linux';
  const terminal = vscode.workspace.getConfiguration('terminal.integrated');
  const file = vscode.env.shell;
  if (!file) throw new Error('VS Code has no default shell');
  return {
    name: basename(file).replace(/\.exe$/i, ''),
    file,
    args: profileArgs(terminal, platform) ?? (process.platform === 'darwin' ? ['-l'] : []),
    env: launchEnv(terminal, platform)
  };
}
