import { randomBytes } from 'node:crypto';
import { basename } from 'node:path';

import QRCode from 'qrcode';
import * as vscode from 'vscode';

import { sharedFiles } from '../cluster/sharedState';
import { errorMessage } from '../errors';
import { watchTargets } from '../fsWatch';
import type { DeviceStore } from '../server/devices';
import { PairingStore } from '../server/pairing';
import type { PocketPilotService } from '../service';
import type { TunnelStatus } from '../tunnel/status';

interface PairingView {
  url: string | null;
  code: string;
  expiresAt: number;
  svg: string | null;
  opening: string;
  warning: string | null;
  paired: string | null;
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function render(view: PairingView, nonce: string): string {
  const body = view.paired
    ? `<section class="done"><h1>Paired ${escape(view.paired)}</h1><p>You can close this tab.</p></section>`
    : `${view.svg ? `<section class="qr">${view.svg}</section>` : ''}
      <section>
        <h1>Pair a phone</h1>
        <ol>
          <li>${
            view.url
              ? `Scan the code with the phone camera, or open <a href="${escape(view.url)}">${escape(view.url)}</a>.`
              : 'Wait for the Cloudflare tunnel to start. The QR code appears here when it is ready.'
          }</li>
          <li>${escape(view.opening)}</li>
          <li>Enter the code below if it is not filled in.</li>
        </ol>
        <p class="code">${escape(view.code)}</p>
        <p id="expiry" data-expires="${view.expiresAt}"></p>
        <button id="renew">New code</button>
        ${view.warning ? `<p class="warning">${escape(view.warning)}</p>` : ''}
      </section>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pair Phone</title>
<style nonce="${nonce}">
  body { display: flex; flex-wrap: wrap; gap: 32px; align-items: flex-start; padding: 32px; font-family: var(--vscode-font-family); color: var(--vscode-foreground); }
  .qr { background: #fff; padding: 16px; border-radius: 8px; width: 280px; }
  .qr svg { display: block; width: 100%; height: auto; }
  section { max-width: 480px; }
  a { color: var(--vscode-textLink-foreground); word-break: break-all; }
  .code { font-size: 40px; letter-spacing: 8px; font-family: var(--vscode-editor-font-family); margin: 16px 0 4px; }
  .warning { color: var(--vscode-editorWarning-foreground); }
  button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: none; padding: 6px 14px; border-radius: 2px; cursor: pointer; }
  button:hover { background: var(--vscode-button-hoverBackground); }
</style>
</head>
<body>
${body}
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const expiry = document.getElementById('expiry');
  const renew = document.getElementById('renew');
  if (renew) renew.addEventListener('click', () => vscode.postMessage({ type: 'renew' }));
  function tick() {
    if (!expiry) return;
    const left = Math.max(0, Math.round((Number(expiry.dataset.expires) - Date.now()) / 1000));
    expiry.textContent = left > 0 ? 'Expires in ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') : 'Expired. Create a new code.';
  }
  tick();
  setInterval(tick, 1000);
</script>
</body>
</html>`;
}

function opening(tunnel: TunnelStatus | null): string {
  return tunnel?.quick === false
    ? 'The app opens through your Cloudflare tunnel. Add it to the home screen to install it.'
    : 'The app opens through a temporary Cloudflare address. It changes when VS Code restarts and cannot be installed. Set up a Cloudflare tunnel for a permanent address.';
}

function warning(service: PocketPilotService): string | null {
  const { role, tunnel } = service;
  if (role.kind === 'error') return role.message;
  if (tunnel?.state === 'error') return `The Cloudflare tunnel failed: ${tunnel.message}`;
  return null;
}

export async function showPairing(
  service: PocketPilotService,
  devices: DeviceStore
): Promise<void> {
  const files = sharedFiles(service.storage);
  const pairing = new PairingStore(files.pairing);
  const panel = vscode.window.createWebviewPanel(
    'pocketPilot.pairing',
    'Pair Phone',
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      localResourceRoots: []
    }
  );
  const openedAt = Date.now();
  let pending: { code: string; expiresAt: number } | null = null;
  let view: PairingView | null = null;

  const show = (): void => {
    if (view) panel.webview.html = render(view, randomBytes(16).toString('base64'));
  };

  const draw = async (): Promise<void> => {
    if (!pending || view?.paired) return;
    const { code, expiresAt } = pending;
    const base = service.phoneUrl();
    const url = base && `${base}/#pair=${code}`;
    const svg =
      url && (await QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }));
    view = {
      url,
      code,
      expiresAt,
      svg,
      opening: opening(service.tunnel),
      warning: warning(service),
      paired: null
    };
    show();
  };

  const renew = async (): Promise<void> => {
    pending = await pairing.create();
    await draw();
  };

  const checkPaired = async (): Promise<void> => {
    const device = (await devices.list()).find((item) => item.pairedAt >= openedAt);
    if (!device || !view) return;
    view = { ...view, paired: device.name };
    show();
  };

  const watcher = watchTargets(
    [{ path: service.storage, depth: 0 }],
    (_event, file) => {
      if (basename(file) === basename(files.devices)) void checkPaired();
    },
    (error) => void vscode.window.showWarningMessage(`Pocket Pilot: ${errorMessage(error)}`),
    () => void checkPaired()
  );

  const tunnelChanged = service.onDidChangeTunnel(() => void draw());

  panel.webview.onDidReceiveMessage((message: { type?: unknown }) => {
    if (message.type === 'renew') void renew();
  });
  panel.onDidDispose(() => {
    void watcher.close();
    tunnelChanged.dispose();
    if (view && !view.paired) void pairing.cancel(view.code);
  });

  try {
    await renew();
  } catch (error) {
    panel.dispose();
    throw error;
  }
}
