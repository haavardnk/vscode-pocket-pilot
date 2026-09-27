import * as vscode from 'vscode';

import type { PasswordSecret } from '../auth/passwordSecret';
import type { TunnelSecret } from '../auth/tunnelSecret';
import type { PocketPilotService } from '../service';

interface MenuItem extends vscode.QuickPickItem {
  command: string;
}

export async function showMenu(
  service: PocketPilotService,
  password: PasswordSecret,
  tunnel: TunnelSecret
): Promise<void> {
  const running = service.role.kind !== 'stopped';
  const hasPassword = await password.enabled();
  const named = await tunnel.get();
  const items: MenuItem[] = [
    ...(running
      ? [
          { label: '$(device-mobile) Pair Phone', command: 'pocketPilot.showPairing' },
          {
            label: '$(copy) Copy Phone URL',
            description: service.phoneUrl() ?? 'Waiting for the tunnel',
            command: 'pocketPilot.copyUrl'
          },
          { label: '$(debug-restart) Restart', command: 'pocketPilot.restart' },
          { label: '$(debug-stop) Stop', command: 'pocketPilot.stop' }
        ]
      : [
          {
            label: '$(play) Start',
            description: 'Serve phones from this computer',
            command: 'pocketPilot.start'
          }
        ]),
    { label: '', kind: vscode.QuickPickItemKind.Separator, command: '' },
    { label: '$(list-unordered) Manage Paired Devices', command: 'pocketPilot.manageDevices' },
    {
      label: named ? '$(cloud) Change Cloudflare Tunnel' : '$(cloud) Set Up Cloudflare Tunnel',
      description: named?.hostname ?? 'Permanent address that phones can install',
      command: 'pocketPilot.setUpTunnel'
    },
    ...(named
      ? [{ label: '$(trash) Remove Cloudflare Tunnel', command: 'pocketPilot.removeTunnel' }]
      : []),
    {
      label: hasPassword ? '$(key) Change Password' : '$(key) Set Password',
      command: 'pocketPilot.setPassword'
    },
    ...(hasPassword
      ? [{ label: '$(trash) Remove Password', command: 'pocketPilot.clearPassword' }]
      : []),
    {
      label: '$(github) Sign In to GitHub',
      description: 'For pull request status',
      command: 'pocketPilot.signInGitHub'
    },
    { label: '$(output) Show Log', command: 'pocketPilot.showLog' }
  ];
  const picked = await vscode.window.showQuickPick(items, {
    title: 'Pocket Pilot',
    placeHolder: service.role.kind
  });
  if (picked?.command) await vscode.commands.executeCommand(picked.command);
}
