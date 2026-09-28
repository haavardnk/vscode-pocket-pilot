import { execFile } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { promisify } from 'node:util';

import { z } from 'zod';

import { parseJson } from '../json';
import { readOptional, writeAtomic } from '../storage/sharedFile';

const recordSchema = z.object({ pid: z.number().int().positive(), binary: z.string().min(1) });

export type PidRecord = z.infer<typeof recordSchema>;

async function commandLine(pid: number): Promise<string | null> {
  if (process.platform === 'win32') return null;
  try {
    const { stdout } = await promisify(execFile)('ps', ['-o', 'command=', '-p', String(pid)]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export function recordPid(file: string, record: PidRecord): Promise<void> {
  return writeAtomic(file, `${JSON.stringify(record)}\n`);
}

export function clearPid(file: string): Promise<void> {
  return rm(file, { force: true });
}

export async function reapStale(file: string, report: (message: string) => void): Promise<void> {
  const text = await readOptional(file);
  if (text === null) return;
  const record = recordSchema.safeParse(parseJson(text));
  await clearPid(file);
  if (!record.success) return;
  const { pid, binary } = record.data;
  const command = await commandLine(pid);
  if (!command?.includes(binary)) return;
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return;
  }
  report(`Stopped cloudflared ${pid} left behind by a crashed VS Code window`);
}
