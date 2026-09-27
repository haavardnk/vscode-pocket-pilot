import { randomUUID } from 'node:crypto';
import { link, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

function temporaryPath(file: string): string {
  return `${file}.${randomUUID()}.tmp`;
}

export async function readOptional(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeAtomic(file: string, content: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temporary = temporaryPath(file);
  await writeFile(temporary, content, { mode: 0o600 });
  await rename(temporary, file);
}

export async function createOnce(file: string, create: () => string): Promise<string> {
  const existing = await readOptional(file);
  if (existing !== null) return existing;
  await mkdir(dirname(file), { recursive: true });
  const temporary = temporaryPath(file);
  await writeFile(temporary, create(), { mode: 0o600 });
  try {
    await link(temporary, file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  } finally {
    await rm(temporary, { force: true });
  }
  return readFile(file, 'utf8');
}
