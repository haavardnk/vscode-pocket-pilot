import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PairingStore } from '../src/server/pairing';

describe('pairing store', () => {
  it('burns the code after five wrong guesses sent at once', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'pocket-pilot-pairing-'));
    try {
      const store = new PairingStore(join(folder, 'pairing.json'));
      const { code } = await store.create();
      const wrong = code === '000000' ? '000001' : '000000';
      const guesses = await Promise.all(Array.from({ length: 20 }, () => store.consume(wrong)));
      expect(guesses.every((ok) => !ok)).toBe(true);
      expect(await store.consume(code)).toBe(false);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});
