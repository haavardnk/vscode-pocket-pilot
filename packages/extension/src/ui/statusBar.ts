import * as vscode from 'vscode';

import type { Role } from '../cluster/cluster';
import type { PocketPilotService } from '../service';
import type { TunnelStatus } from '../tunnel/status';

function tunnelLine(status: TunnelStatus | null): string {
  if (!status) return '';
  const name = status.quick ? 'Quick Cloudflare tunnel' : 'Cloudflare tunnel';
  if (status.state === 'ready') return `\n${name} at ${status.url}`;
  if (status.state === 'starting') return `\n${name} is starting`;
  return `\n${name} failed: ${status.message}`;
}

function describe(
  role: Role,
  tunnel: TunnelStatus | null
): { text: string; tooltip: string; error: boolean } {
  if (role.kind === 'leader')
    return {
      text: '$(broadcast) Pilot',
      tooltip: `Pocket Pilot is serving phones${tunnelLine(tunnel)}`,
      error: false
    };
  if (role.kind === 'follower') {
    return {
      text: '$(broadcast) Pilot',
      tooltip: `Phones reach this window through another VS Code window${tunnelLine(tunnel)}`,
      error: false
    };
  }
  if (role.kind === 'starting')
    return { text: '$(sync~spin) Pilot', tooltip: 'Pocket Pilot is starting', error: false };
  if (role.kind === 'error')
    return { text: '$(warning) Pilot', tooltip: role.message, error: true };
  return { text: '$(circle-slash) Pilot', tooltip: 'Pocket Pilot is stopped', error: false };
}

export function createStatusBar(service: PocketPilotService): vscode.Disposable {
  const item = vscode.window.createStatusBarItem(
    'pocketPilot.status',
    vscode.StatusBarAlignment.Right,
    100
  );
  item.name = 'Pocket Pilot';
  item.command = 'pocketPilot.menu';
  const update = (): void => {
    const view = describe(service.role, service.tunnel);
    item.text = view.text;
    item.tooltip = view.tooltip;
    item.backgroundColor = view.error
      ? new vscode.ThemeColor('statusBarItem.errorBackground')
      : undefined;
  };
  update();
  item.show();
  return vscode.Disposable.from(
    item,
    service.onDidChangeRole(update),
    service.onDidChangeTunnel(update)
  );
}
