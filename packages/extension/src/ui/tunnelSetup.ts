import * as vscode from 'vscode';

import type { TunnelSecret } from '../auth/tunnelSecret';
import { readSettings } from '../settings';
import { normalizeHostname, parseTunnelToken } from '../tunnel/named';

const TITLE = 'Set Up Cloudflare Tunnel';

export async function setUpTunnel(secret: TunnelSecret): Promise<void> {
  const current = await secret.get();
  const hostnameInput = await vscode.window.showInputBox({
    title: `${TITLE} (1/2)`,
    prompt: 'Public hostname of the tunnel, such as agent.example.com',
    value: current?.hostname,
    ignoreFocusOut: true,
    validateInput: (value) =>
      normalizeHostname(value) ? null : 'Enter a hostname such as agent.example.com'
  });
  const hostname = hostnameInput === undefined ? null : normalizeHostname(hostnameInput);
  if (!hostname) return;
  const tokenInput = await vscode.window.showInputBox({
    title: `${TITLE} (2/2)`,
    prompt:
      'Paste the tunnel token, or the whole cloudflared install command, from the Cloudflare dashboard.',
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) =>
      parseTunnelToken(value) ? null : 'This is not a Cloudflare tunnel token'
  });
  const token = tokenInput === undefined ? null : parseTunnelToken(tokenInput);
  if (!token) return;
  await secret.store({ hostname, token });
  void vscode.window.showInformationMessage(
    `Cloudflare tunnel saved. In the Cloudflare dashboard, route ${hostname} to http://127.0.0.1:${readSettings().port + 1}.`
  );
}

export async function removeTunnel(secret: TunnelSecret): Promise<void> {
  const choice = await vscode.window.showWarningMessage(
    'Remove the Cloudflare tunnel token? Pocket Pilot falls back to a quick tunnel with a temporary address.',
    { modal: true },
    'Remove'
  );
  if (choice === 'Remove') await secret.clear();
}
