import type { Dirent } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

export const MAX_TREE_ENTRIES = 2000;

export interface DirectoryEntry {
  name: string;
  directory: boolean;
}

export interface DirectoryListing {
  entries: DirectoryEntry[];
  truncated: boolean;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

async function isDirectory(parent: string, entry: Dirent): Promise<boolean> {
  if (!entry.isSymbolicLink()) return entry.isDirectory();
  return stat(join(parent, entry.name)).then(
    (info) => info.isDirectory(),
    () => false
  );
}

export async function listDirectory(directory: string): Promise<DirectoryListing> {
  const dirents = (await readdir(directory, { withFileTypes: true })).filter(
    (entry) => entry.name !== '.git'
  );
  const entries = await Promise.all(
    dirents.map(async (entry) => ({
      name: entry.name,
      directory: await isDirectory(directory, entry)
    }))
  );
  entries.sort(
    (a, b) => Number(b.directory) - Number(a.directory) || collator.compare(a.name, b.name)
  );
  return {
    entries: entries.slice(0, MAX_TREE_ENTRIES),
    truncated: entries.length > MAX_TREE_ENTRIES
  };
}
