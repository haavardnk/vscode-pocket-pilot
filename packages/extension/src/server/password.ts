import { randomBytes, scrypt, type ScryptOptions, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 32;
const COST = 2 ** 15;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const MAX_MEMORY = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      KEY_LENGTH,
      { ...options, maxmem: MAX_MEMORY },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      }
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, { N: COST, r: BLOCK_SIZE, p: PARALLELISM });
  return [
    'scrypt',
    COST,
    BLOCK_SIZE,
    PARALLELISM,
    salt.toString('base64url'),
    key.toString('base64url')
  ].join('$');
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  const [scheme, cost, blockSize, parallelism, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const key = await derive(password, Buffer.from(salt, 'base64url'), {
    N: Number(cost),
    r: Number(blockSize),
    p: Number(parallelism)
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}
