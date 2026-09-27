import { createHash } from 'node:crypto';
import { relative, sep } from 'node:path';

import { isInside } from './paths';

export interface CodeFolder {
  id: string;
  name: string;
  root: string;
}

export interface FolderLocation {
  folder: CodeFolder;
  relative: string;
}

export function codeFolder(name: string, root: string): CodeFolder {
  return { id: createHash('sha1').update(root).digest('hex').slice(0, 12), name, root };
}

export function locate(folders: readonly CodeFolder[], path: string): FolderLocation | null {
  const owner = folders
    .filter((folder) => isInside(folder.root, path) && relative(folder.root, path) !== '')
    .sort((a, b) => b.root.length - a.root.length)[0];
  return owner
    ? { folder: owner, relative: relative(owner.root, path).split(sep).join('/') }
    : null;
}
