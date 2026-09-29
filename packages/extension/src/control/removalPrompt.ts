import { setTimeout as delay } from 'node:timers/promises';

import * as vscode from 'vscode';

const SECTION = 'chat.editing';
const KEY = 'confirmEditRequestRemoval';
const MARKER = 'pocketPilot.suppressedRemovalPrompt';
const PROMPT_MS = 3000;

interface Marker {
  previous: boolean | null;
}

export class RemovalPrompt {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly state: vscode.Memento) {}

  recover(): Promise<void> {
    const marker = this.state.get<Marker>(MARKER);
    if (!marker) return Promise.resolve();
    return this.enqueue(() => this.restore(marker.previous));
  }

  run(command: () => Thenable<unknown>): Promise<void> {
    return this.enqueue(async () => {
      const config = vscode.workspace.getConfiguration(SECTION);
      const flip = config.get<boolean>(KEY, true);
      const previous = config.inspect<boolean>(KEY)?.globalValue ?? null;
      if (flip) {
        await this.state.update(MARKER, { previous } satisfies Marker);
        await config.update(KEY, false, vscode.ConfigurationTarget.Global);
      }
      try {
        const done = Promise.resolve(command()).then(() => false);
        done.catch(() => undefined);
        const prompted = delay(PROMPT_MS, true, { ref: false });
        if (await Promise.race([done, prompted])) {
          throw new Error('VS Code is asking for confirmation on the desktop');
        }
      } finally {
        if (flip) await this.restore(previous);
      }
    });
  }

  private async restore(previous: boolean | null): Promise<void> {
    const config = vscode.workspace.getConfiguration(SECTION);
    if (config.inspect<boolean>(KEY)?.globalValue === false) {
      await config.update(KEY, previous ?? undefined, vscode.ConfigurationTarget.Global);
    }
    await this.state.update(MARKER, undefined);
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    const next = this.queue.then(task);
    this.queue = next.catch(() => undefined);
    return next;
  }
}
