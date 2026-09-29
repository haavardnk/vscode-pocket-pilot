import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { rm } from 'node:fs/promises';

import { z } from 'zod';

import { parseJson } from '../json';
import { readOptional, writeAtomic } from '../storage/sharedFile';

const CODE_TTL_MS = 5 * 60_000;
const MAX_FAILURES = 5;

const pairingSchema = z.object({
  codeHash: z.string(),
  expiresAt: z.number(),
  failures: z.number()
});

type Pairing = z.infer<typeof pairingSchema>;

function hashCode(code: string): Buffer {
  return createHash('sha256').update(code).digest();
}

export class PairingStore {
  private checking: Promise<unknown> = Promise.resolve();

  constructor(private readonly file: string) {}

  async create(): Promise<{ code: string; expiresAt: number }> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const expiresAt = Date.now() + CODE_TTL_MS;
    await this.write({ codeHash: hashCode(code).toString('hex'), expiresAt, failures: 0 });
    return { code, expiresAt };
  }

  consume(code: string): Promise<boolean> {
    const result = this.checking.then(() => this.check(code));
    this.checking = result.catch(() => undefined);
    return result;
  }

  private async check(code: string): Promise<boolean> {
    const pairing = await this.read();
    if (!pairing) return false;
    if (pairing.expiresAt <= Date.now()) {
      await this.clear();
      return false;
    }
    const expected = Buffer.from(pairing.codeHash, 'hex');
    const actual = hashCode(code);
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
      await this.clear();
      return true;
    }
    const failures = pairing.failures + 1;
    if (failures >= MAX_FAILURES) await this.clear();
    else await this.write({ ...pairing, failures });
    return false;
  }

  clear(): Promise<void> {
    return rm(this.file, { force: true });
  }

  async cancel(code: string): Promise<void> {
    const pairing = await this.read();
    if (pairing?.codeHash === hashCode(code).toString('hex')) await this.clear();
  }

  private async read(): Promise<Pairing | null> {
    const text = await readOptional(this.file);
    if (text === null) return null;
    const result = pairingSchema.safeParse(parseJson(text));
    return result.success ? result.data : null;
  }

  private write(pairing: Pairing): Promise<void> {
    return writeAtomic(this.file, JSON.stringify(pairing));
  }
}
