import { createRequire } from 'node:module';
import { join } from 'node:path';

import { errorMessage } from '../errors';
import { asRecord } from '../json';

const CANDIDATES = ['node_modules.asar/node-pty', 'node_modules/node-pty'];

export interface PtyOptions {
  name: string;
  cols: number;
  rows: number;
  cwd: string | undefined;
  env: Record<string, string>;
}

export interface Pty {
  onData(listener: (data: string) => void): { dispose(): void };
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): { dispose(): void };
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
}

export type SpawnPty = (file: string, args: string[], options: PtyOptions) => Pty;

export function loadNodePty(appRoot: string): SpawnPty {
  const load = createRequire(join(appRoot, 'package.json'));
  const failures: string[] = [];
  for (const candidate of CANDIDATES) {
    try {
      const spawn: unknown = asRecord(load(join(appRoot, candidate))).spawn;
      if (typeof spawn === 'function') return spawn as SpawnPty;
      failures.push(`${candidate} has no spawn function`);
    } catch (error) {
      failures.push(`${candidate}: ${errorMessage(error)}`);
    }
  }
  throw new Error(`VS Code's node-pty could not be loaded (${failures.join('; ')})`);
}
