import { setTimeout as delay } from 'node:timers/promises';

import type { Delivery, Model } from '@pocket-pilot/protocol';
import * as vscode from 'vscode';

import {
  LOCAL_SESSION_AUTHORITY,
  LOCAL_SESSION_SCHEME,
  localSessionPath
} from '../sessions/sessionUri';

const ATTACH_SETTLE_MS = 300;
const ATTACH_SETTLE_PER_IMAGE_MS = 150;

export function sessionResource(sessionId: string): vscode.Uri {
  return vscode.Uri.from({
    scheme: LOCAL_SESSION_SCHEME,
    authority: LOCAL_SESSION_AUTHORITY,
    path: localSessionPath(sessionId)
  });
}

export async function focusChat(sessionId: string): Promise<void> {
  await vscode.commands.executeCommand('vscode.open', sessionResource(sessionId));
}

export async function attachImages(paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  for (const path of paths) {
    await vscode.commands.executeCommand('workbench.action.chat.attachFile', vscode.Uri.file(path));
  }
  await delay(ATTACH_SETTLE_MS + ATTACH_SETTLE_PER_IMAGE_MS * paths.length);
}

export async function submitChat(
  sessionId: string,
  text: string,
  images: readonly string[] = [],
  delivery: Delivery | null = null
): Promise<void> {
  await focusChat(sessionId);
  await attachImages(images);
  await vscode.commands.executeCommand('workbench.action.chat.submit', {
    inputValue: text,
    ...(delivery ? { acceptInputOptions: { queue: delivery } } : {})
  });
}

export async function selectModel(model: Model): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.chat.changeModel', {
    vendor: model.vendor,
    id: model.id.slice(model.vendor.length + 1),
    family: model.family
  });
}
