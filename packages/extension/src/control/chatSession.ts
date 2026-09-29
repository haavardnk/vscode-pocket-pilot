import type { Model } from '@pocket-pilot/protocol';
import * as vscode from 'vscode';

import {
  LOCAL_SESSION_AUTHORITY,
  LOCAL_SESSION_SCHEME,
  localSessionPath
} from '../sessions/sessionUri';

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

export async function submitChat(sessionId: string, text: string): Promise<void> {
  await focusChat(sessionId);
  await vscode.commands.executeCommand('workbench.action.chat.submit', { inputValue: text });
}

export async function selectModel(model: Model): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.chat.changeModel', {
    vendor: model.vendor,
    id: model.id.slice(model.vendor.length + 1),
    family: model.family
  });
}
