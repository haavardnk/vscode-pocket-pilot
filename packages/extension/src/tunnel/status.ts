import { rm } from 'node:fs/promises';
import { basename, dirname } from 'node:path';

import type { FSWatcher } from 'chokidar';
import { z } from 'zod';

import { watchTargets } from '../fsWatch';
import { parseJson } from '../json';
import { readOptional, writeAtomic } from '../storage/sharedFile';

const tunnelStatusSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('starting'), quick: z.boolean() }),
  z.object({ state: z.literal('ready'), quick: z.boolean(), url: z.string() }),
  z.object({ state: z.literal('error'), quick: z.boolean(), message: z.string() })
]);
export type TunnelStatus = z.infer<typeof tunnelStatusSchema>;

async function readTunnelStatus(file: string): Promise<TunnelStatus | null> {
  const text = await readOptional(file);
  if (text === null) return null;
  const result = tunnelStatusSchema.safeParse(parseJson(text));
  return result.success ? result.data : null;
}

export function writeTunnelStatus(file: string, status: TunnelStatus): Promise<void> {
  return writeAtomic(file, JSON.stringify(status));
}

export function clearTunnelStatus(file: string): Promise<void> {
  return rm(file, { force: true });
}

export function watchTunnelStatus(
  file: string,
  onStatus: (status: TunnelStatus | null) => void,
  onError: (error: unknown) => void
): FSWatcher {
  let latest = 0;
  const refresh = (): void => {
    latest += 1;
    const id = latest;
    readTunnelStatus(file).then((status) => {
      if (id === latest) onStatus(status);
    }, onError);
  };
  const watcher = watchTargets(
    [{ path: dirname(file), depth: 0 }],
    (_event, changed) => {
      if (basename(changed) === basename(file)) refresh();
    },
    onError,
    refresh
  );
  refresh();
  return watcher;
}
