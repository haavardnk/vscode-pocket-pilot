import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LineTailer } from '../src/sessions/lineTailer';

describe('LineTailer', () => {
  let folder: string;
  let file: string;

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'tailer-'));
    file = join(folder, 'log.jsonl');
  });

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  it('returns null for a missing file', async () => {
    expect(await new LineTailer(file).read()).toBeNull();
  });

  it('reads only complete new lines', async () => {
    const tailer = new LineTailer(file);
    await writeFile(file, 'one\ntwo\npart');
    expect(await tailer.read()).toEqual({ reset: false, lines: ['one', 'two'] });
    await appendFile(file, 'ial\nthree\n');
    expect(await tailer.read()).toEqual({ reset: false, lines: ['partial', 'three'] });
    expect(await tailer.read()).toEqual({ reset: false, lines: [] });
  });

  it.each([
    ['shrinks', 'new\n'],
    ['is rewritten in place', 'ONE\ntwo\nmore\n']
  ])('resets when the file %s', async (_name, rewritten) => {
    const tailer = new LineTailer(file);
    await writeFile(file, 'one\ntwo\n');
    await tailer.read();
    await writeFile(file, rewritten);
    expect(await tailer.read()).toEqual({ reset: true, lines: rewritten.trim().split('\n') });
  });
});
