import * as vscode from 'vscode';

import { onDidChangeGitHubSessions, signInGitHub } from './auth/github';
import { PasswordSecret } from './auth/passwordSecret';
import { TunnelSecret } from './auth/tunnelSecret';
import { sharedFiles } from './cluster/sharedState';
import { errorMessage } from './errors';
import { DeviceStore } from './server/devices';
import { PocketPilotService } from './service';
import { readSettings, SECTION, setEnabled } from './settings';
import { manageDevices } from './ui/devicesPicker';
import { showMenu } from './ui/menu';
import { showPairing } from './ui/pairingPanel';
import { createStatusBar } from './ui/statusBar';
import { removeTunnel, setUpTunnel } from './ui/tunnelSetup';

let service: PocketPilotService | null = null;

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel('Pocket Pilot', { log: true });
  const password = new PasswordSecret(context.secrets);
  const tunnel = new TunnelSecret(context.secrets);
  const pilot = new PocketPilotService(context, password, tunnel, log);
  const devices = new DeviceStore(
    sharedFiles(pilot.storage).devices,
    () => readSettings().expireDays
  );
  service = pilot;

  const register = (command: string, run: () => Thenable<unknown>): vscode.Disposable =>
    vscode.commands.registerCommand(command, async () => {
      try {
        await run();
      } catch (error) {
        log.error(`${command} failed: ${errorMessage(error)}`);
        void vscode.window.showErrorMessage(`Pocket Pilot: ${errorMessage(error)}`);
      }
    });

  const start = async (): Promise<void> => {
    if (readSettings().enabled) await pilot.start();
    else await setEnabled(true);
  };

  context.subscriptions.push(
    log,
    password,
    tunnel,
    createStatusBar(pilot),
    register('pocketPilot.menu', () => showMenu(pilot, password, tunnel)),
    register('pocketPilot.start', start),
    register('pocketPilot.stop', () => setEnabled(false)),
    register('pocketPilot.restart', () => pilot.restart()),
    register('pocketPilot.showPairing', async () => {
      if (pilot.role.kind === 'stopped') {
        const choice = await vscode.window.showInformationMessage(
          'Pocket Pilot is stopped. Start it to pair a phone?',
          'Start'
        );
        if (choice !== 'Start') return;
        await start();
      }
      await showPairing(pilot, devices);
    }),
    register('pocketPilot.copyUrl', async () => {
      const url = pilot.phoneUrl();
      if (!url) throw new Error('The Cloudflare tunnel is not ready yet');
      await vscode.env.clipboard.writeText(url);
      void vscode.window.showInformationMessage(`Copied ${url}`);
    }),
    register('pocketPilot.manageDevices', () => manageDevices(devices)),
    register('pocketPilot.setPassword', async () => {
      if (await password.prompt())
        void vscode.window.showInformationMessage('Pocket Pilot password saved.');
    }),
    register('pocketPilot.clearPassword', async () => {
      const choice = await vscode.window.showWarningMessage(
        'Remove the Pocket Pilot password? Phones that are already signed in stay signed in.',
        { modal: true },
        'Remove'
      );
      if (choice === 'Remove') await password.clear();
    }),
    register('pocketPilot.setUpTunnel', () => setUpTunnel(tunnel)),
    register('pocketPilot.removeTunnel', () => removeTunnel(tunnel)),
    register('pocketPilot.signInGitHub', async () => {
      if (await signInGitHub()) pilot.refreshPullRequests();
    }),
    register('pocketPilot.showLog', async () => log.show()),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(SECTION)) void pilot.settingsChanged();
    }),
    onDidChangeGitHubSessions(() => pilot.refreshPullRequests()),
    tunnel.onDidChange(() => void pilot.tunnelSecretChanged())
  );

  if (readSettings().enabled) {
    pilot.start().catch((error: unknown) => log.error(`Start failed: ${errorMessage(error)}`));
  }
}

export async function deactivate(): Promise<void> {
  await service?.shutdown();
  service = null;
}
