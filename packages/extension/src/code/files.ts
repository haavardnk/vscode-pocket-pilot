import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';

import type { FileContent } from '@pocket-pilot/protocol';

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
const BINARY_PROBE_BYTES = 8000;
const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon'
};

export type Blob = Buffer | 'missing' | 'tooLarge';

export interface FileBlob {
  size: number;
  blob: Blob;
}

export function isBinary(data: Buffer): boolean {
  return data.subarray(0, BINARY_PROBE_BYTES).includes(0);
}

export async function readBlob(path: string): Promise<FileBlob> {
  const info = await stat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  });
  if (!info?.isFile()) return { size: 0, blob: 'missing' };
  if (info.size > MAX_FILE_BYTES) return { size: info.size, blob: 'tooLarge' };
  return { size: info.size, blob: await readFile(path) };
}

export function fileContent(blob: Blob, path: string): FileContent {
  if (blob === 'missing' || blob === 'tooLarge') return { kind: blob };
  const mime = IMAGE_TYPES[extname(path).toLowerCase()];
  if (mime) return { kind: 'image', mime, data: blob.toString('base64') };
  if (isBinary(blob)) return { kind: 'binary' };
  return { kind: 'text', text: blob.toString('utf8') };
}
