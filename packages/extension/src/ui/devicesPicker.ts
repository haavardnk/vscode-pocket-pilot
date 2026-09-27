import * as vscode from 'vscode';

import type { DeviceStore } from '../server/devices';

interface DeviceItem extends vscode.QuickPickItem {
  id: string;
}

function formatDate(time: number): string {
  return new Date(time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export async function manageDevices(devices: DeviceStore): Promise<void> {
  const list = await devices.list();
  if (list.length === 0) {
    void vscode.window.showInformationMessage('No phones are paired with Pocket Pilot.');
    return;
  }
  const items: DeviceItem[] = list
    .toSorted((a, b) => b.lastSeenAt - a.lastSeenAt)
    .map((device) => ({
      id: device.id,
      label: `$(device-mobile) ${device.name}`,
      description: `last seen ${formatDate(device.lastSeenAt)}`,
      detail: `Paired ${formatDate(device.pairedAt)}`
    }));
  const picked = await vscode.window.showQuickPick(items, {
    title: 'Forget Paired Devices',
    placeHolder: 'Select the devices to sign out',
    canPickMany: true
  });
  if (!picked || picked.length === 0) return;
  await devices.remove(picked.map((item) => item.id));
  void vscode.window.showInformationMessage(
    picked.length === 1 ? 'Forgot 1 device.' : `Forgot ${picked.length} devices.`
  );
}
