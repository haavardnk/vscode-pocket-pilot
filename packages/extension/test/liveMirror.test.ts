import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { LiveMirror } from '../src/sessions/liveMirror';

async function waitFor(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 3000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('LiveMirror', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'pocket-pilot-mirror-'));
  });

  afterAll(() => rm(root, { recursive: true, force: true }));

  it('applies changed exports while warm and stops when disabled', async () => {
    let content = '{"n":1}';
    let exports = 0;
    const applied: unknown[] = [];
    const reports: string[] = [];
    const mirror = new LiveMirror({
      file: join(root, 'nested', 'live.json'),
      exportTo: async (file) => {
        exports += 1;
        if (content === 'fail') throw new Error('no chat widget');
        await writeFile(file, content);
      },
      active: () => false,
      apply: (value) => applied.push(value),
      report: (message) => reports.push(message)
    });
    mirror.setEnabled(true);
    mirror.poke();
    await waitFor(() => exports >= 2);
    expect(applied).toEqual([{ n: 1 }]);
    content = '{"n":2}';
    mirror.poke();
    await waitFor(() => applied.length === 2);
    content = 'fail';
    mirror.poke();
    await waitFor(() => reports.length === 1);
    expect(reports).toEqual(['Live chat export failed: no chat widget']);
    mirror.setEnabled(false);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const stopped = exports;
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect([exports, applied]).toEqual([stopped, [{ n: 1 }, { n: 2 }]]);
    mirror.dispose();
  });
});
