import { open } from 'node:fs/promises';

const MARKER_BYTES = 64;
const NEWLINE = 0x0a;

export interface TailRead {
  reset: boolean;
  lines: string[];
}

export class LineTailer {
  private offset = 0;
  private marker: Buffer = Buffer.alloc(0);

  constructor(readonly path: string) {}

  async read(): Promise<TailRead | null> {
    let handle;
    try {
      handle = await open(this.path, 'r');
    } catch {
      return null;
    }
    try {
      const { size } = await handle.stat();
      const reset = size < this.offset || !(await this.markerMatches(handle));
      if (reset) {
        this.offset = 0;
        this.marker = Buffer.alloc(0);
      }
      if (size === this.offset) return { reset, lines: [] };
      const buffer = Buffer.alloc(size - this.offset);
      await handle.read(buffer, 0, buffer.length, this.offset);
      const end = buffer.lastIndexOf(NEWLINE);
      if (end < 0) return { reset, lines: [] };
      this.offset += end + 1;
      this.marker = Buffer.concat([this.marker, buffer.subarray(0, end + 1)]).subarray(
        -MARKER_BYTES
      );
      const lines = buffer.toString('utf8', 0, end).split('\n');
      return { reset, lines: lines.filter((line) => line.length > 0) };
    } finally {
      await handle.close();
    }
  }

  private async markerMatches(handle: Awaited<ReturnType<typeof open>>): Promise<boolean> {
    if (this.marker.length === 0) return true;
    const current = Buffer.alloc(this.marker.length);
    await handle.read(current, 0, current.length, this.offset - current.length);
    return current.equals(this.marker);
  }
}
