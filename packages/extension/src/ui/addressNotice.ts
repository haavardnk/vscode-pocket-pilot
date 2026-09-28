import * as vscode from 'vscode';

import type { DeviceStore } from '../server/devices';
import type { PocketPilotService } from '../service';

const PAIR = 'Pair Phone';
const SET_UP = 'Set Up Tunnel';

async function notify(devices: DeviceStore): Promise<void> {
  if ((await devices.list()).length === 0) return;
  const choice = await vscode.window.showWarningMessage(
    'The quick tunnel restarted with a new address, so paired phones can no longer reach VS Code. Pair them again, or set up a Cloudflare tunnel for an address that does not change.',
    PAIR,
    SET_UP
  );
  if (choice === PAIR) await vscode.commands.executeCommand('pocketPilot.showPairing');
  if (choice === SET_UP) await vscode.commands.executeCommand('pocketPilot.setUpTunnel');
}

export function watchQuickAddress(
  service: PocketPilotService,
  devices: DeviceStore
): vscode.Disposable {
  let known: string | null = null;
  return service.onDidChangeTunnel((status) => {
    if (status?.state !== 'ready' || !status.quick) return;
    const previous = known;
    known = status.url;
    if (previous === null || previous === status.url || service.role.kind !== 'leader') return;
    void notify(devices);
  });
}
