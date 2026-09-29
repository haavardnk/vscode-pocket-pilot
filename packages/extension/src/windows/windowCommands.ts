import type { Command } from '@pocket-pilot/protocol';
import * as vscode from 'vscode';

import { errorMessage } from '../errors';

const CLOSE_DELAY_MS = 250;

export type WindowCommand = Extract<Command, { kind: 'closeWindow' }>;

export function isWindowCommand(command: Command): command is WindowCommand {
  return command.kind === 'closeWindow';
}

export function runWindowCommand(command: WindowCommand, report: (message: string) => void): void {
  if (command.kind !== 'closeWindow') return;
  setTimeout(() => {
    vscode.commands
      .executeCommand('workbench.action.closeWindow')
      .then(undefined, (error: unknown) =>
        report(`Could not close the window: ${errorMessage(error)}`)
      );
  }, CLOSE_DELAY_MS);
}
