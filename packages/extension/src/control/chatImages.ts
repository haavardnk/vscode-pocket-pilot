import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ShownImageType } from '@pocket-pilot/protocol';

import { bytesType } from '../sessions/requestImages';

const KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const BATCH_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EXTENSIONS: Record<ShownImageType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp'
};

export interface ImageData {
  mimeType: ShownImageType;
  data: string;
}

export class ChatImages {
  constructor(private readonly dir: string) {}

  async write(images: readonly ImageData[]): Promise<string[]> {
    if (images.length === 0) return [];
    const files = images.map((image, index) => {
      const bytes = Buffer.from(image.data, 'base64');
      if (bytesType(bytes) !== image.mimeType) {
        throw new Error('Photo does not match its image type');
      }
      return { name: `photo-${index + 1}.${EXTENSIONS[image.mimeType]}`, bytes };
    });
    const batch = join(this.dir, randomUUID());
    await mkdir(batch, { recursive: true });
    await Promise.all(
      files.map((file) => writeFile(join(batch, file.name), file.bytes, { flag: 'wx' }))
    );
    return files.map((file) => join(batch, file.name));
  }

  async prune(now = Date.now()): Promise<void> {
    const entries = await readdir(this.dir, { withFileTypes: true }).catch(() => []);
    const batches = entries.filter((entry) => entry.isDirectory() && BATCH_NAME.test(entry.name));
    for (const batch of batches) {
      const path = join(this.dir, batch.name);
      const info = await stat(path).catch(() => null);
      if (info && now - info.mtimeMs > KEEP_MS) await rm(path, { recursive: true, force: true });
    }
  }
}
