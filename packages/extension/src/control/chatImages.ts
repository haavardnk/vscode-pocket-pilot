import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ImageUpload } from '@pocket-pilot/protocol';

const KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const BATCH_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FORMATS: Record<ImageUpload['mimeType'], { signature: number[]; extension: string }> = {
  'image/jpeg': { signature: [0xff, 0xd8, 0xff], extension: 'jpg' },
  'image/png': { signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], extension: 'png' }
};

export class ChatImages {
  constructor(private readonly dir: string) {}

  async write(images: readonly ImageUpload[]): Promise<string[]> {
    if (images.length === 0) return [];
    const files = images.map((image, index) => {
      const format = FORMATS[image.mimeType];
      const bytes = Buffer.from(image.data, 'base64');
      if (!format.signature.every((byte, offset) => bytes[offset] === byte)) {
        throw new Error('Photo is not a valid JPEG or PNG image');
      }
      return { name: `photo-${index + 1}.${format.extension}`, bytes };
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
