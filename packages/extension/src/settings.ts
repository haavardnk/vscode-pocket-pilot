import * as vscode from 'vscode';

export const SECTION = 'pocketPilot';

export interface Settings {
  enabled: boolean;
  port: number;
  cloudflaredPath: string;
  expireDays: number;
  pullRequestsEnabled: boolean;
  pollSeconds: number;
}

export function readSettings(): Settings {
  const config = vscode.workspace.getConfiguration(SECTION);
  return {
    enabled: config.get<boolean>('enabled', false),
    port: config.get<number>('port', 48111),
    cloudflaredPath: config.get<string>('tunnel.cloudflaredPath', '').trim(),
    expireDays: config.get<number>('devices.expireDays', 30),
    pullRequestsEnabled: config.get<boolean>('pullRequests.enabled', true),
    pollSeconds: Math.max(15, config.get<number>('pullRequests.pollSeconds', 60))
  };
}

export function setEnabled(enabled: boolean): Thenable<void> {
  return vscode.workspace
    .getConfiguration(SECTION)
    .update('enabled', enabled, vscode.ConfigurationTarget.Global);
}
