import { dirname, join } from 'node:path';

import type * as vscode from 'vscode';

export interface ChatPaths {
  sessions: string;
  transcripts: string | null;
  debugLogs: string | null;
  userDir: string;
  modelSettings: string;
  copilotStorage: string;
}

export function chatPaths(context: vscode.ExtensionContext): ChatPaths {
  const globalStorage = dirname(context.globalStorageUri.fsPath);
  const userDir = dirname(globalStorage);
  const shared = {
    userDir,
    modelSettings: join(userDir, 'chatLanguageModels.json'),
    copilotStorage: join(globalStorage, 'github.copilot-chat')
  };
  if (!context.storageUri) {
    return {
      ...shared,
      sessions: join(globalStorage, 'emptyWindowChatSessions'),
      transcripts: null,
      debugLogs: null
    };
  }
  const workspaceStorage = dirname(context.storageUri.fsPath);
  const copilot = join(workspaceStorage, 'GitHub.copilot-chat');
  return {
    ...shared,
    sessions: join(workspaceStorage, 'chatSessions'),
    transcripts: join(copilot, 'transcripts'),
    debugLogs: join(copilot, 'debug-logs')
  };
}
