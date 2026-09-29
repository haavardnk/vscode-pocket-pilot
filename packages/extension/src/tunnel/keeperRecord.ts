import { rm } from 'node:fs/promises';

import { z } from 'zod';

import { parseJson } from '../json';
import { readOptional, writeAtomic } from '../storage/sharedFile';

export const KEEPER_CONFIG = 'POCKET_PILOT_KEEPER';

export const keeperConfigSchema = z.object({
  binary: z.string().min(1),
  originPort: z.number().int(),
  leaderPort: z.number().int(),
  hostname: z.string().nullable(),
  linkFile: z.string().min(1),
  secretFile: z.string().min(1),
  recordFile: z.string().min(1),
  statusFile: z.string().min(1),
  pidFile: z.string().min(1)
});
export type KeeperConfig = z.infer<typeof keeperConfigSchema>;

const keeperRecordSchema = z.object({
  pid: z.number().int().positive(),
  script: z.string(),
  scriptHash: z.string(),
  version: z.string(),
  port: z.number().int(),
  cloudflaredPath: z.string(),
  hostname: z.string().nullable(),
  tokenHash: z.string().nullable()
});
export type KeeperRecord = z.infer<typeof keeperRecordSchema>;
export type KeeperIdentity = Omit<KeeperRecord, 'pid'>;

export async function readKeeperRecord(file: string): Promise<KeeperRecord | null> {
  const text = await readOptional(file);
  if (text === null) return null;
  const result = keeperRecordSchema.safeParse(parseJson(text));
  return result.success ? result.data : null;
}

export function writeKeeperRecord(file: string, record: KeeperRecord): Promise<void> {
  return writeAtomic(file, `${JSON.stringify(record)}\n`);
}

export function clearKeeperRecord(file: string): Promise<void> {
  return rm(file, { force: true });
}

export function sameKeeper(record: KeeperRecord, identity: KeeperIdentity): boolean {
  return (
    record.script === identity.script &&
    record.scriptHash === identity.scriptHash &&
    record.version === identity.version &&
    record.port === identity.port &&
    record.cloudflaredPath === identity.cloudflaredPath &&
    record.hostname === identity.hostname &&
    record.tokenHash === identity.tokenHash
  );
}

export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}
