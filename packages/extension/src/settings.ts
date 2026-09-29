import * as vscode from 'vscode';

import type { AccessSettings } from './server/accessCheck';

export const SECTION = 'pocketPilot';

export type LiveMirrorMode = 'full' | 'hooks' | 'off';

export interface Settings {
  enabled: boolean;
  port: number;
  cloudflaredPath: string;
  access: AccessSettings | null;
  expireDays: number;
  liveMirror: LiveMirrorMode;
}

export function liveMirrorMode(): LiveMirrorMode {
  const mode = vscode.workspace.getConfiguration(SECTION).get<string>('liveMirror', 'full');
  return mode === 'hooks' || mode === 'off' ? mode : 'full';
}

export function readSettings(): Settings {
  const config = vscode.workspace.getConfiguration(SECTION);
  const teamDomain = config.get<string>('tunnel.access.teamDomain', '').trim();
  const audience = config.get<string>('tunnel.access.audience', '').trim();
  const emails = config
    .get<string[]>('tunnel.access.emails', [])
    .map((email) => email.trim())
    .filter((email) => email !== '');
  return {
    enabled: config.get<boolean>('enabled', false),
    port: config.get<number>('port', 48111),
    cloudflaredPath: config.get<string>('tunnel.cloudflaredPath', '').trim(),
    access: teamDomain || audience || emails.length > 0 ? { teamDomain, audience, emails } : null,
    expireDays: config.get<number>('devices.expireDays', 30),
    liveMirror: liveMirrorMode()
  };
}

export function setEnabled(enabled: boolean): Thenable<void> {
  return vscode.workspace
    .getConfiguration(SECTION)
    .update('enabled', enabled, vscode.ConfigurationTarget.Global);
}
