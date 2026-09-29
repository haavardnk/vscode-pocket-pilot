import { createHmac, randomBytes } from 'node:crypto';

import { sameSecret } from './sharedState';

export type ProofRole = 'leader' | 'follower' | 'origin' | 'keeper';

export function newNonce(): string {
  return randomBytes(32).toString('base64url');
}

export function proof(secret: string, role: ProofRole, port: number, nonce: string): string {
  return createHmac('sha256', secret).update(`${role}:${port}:${nonce}`).digest('base64url');
}

export function validProof(
  secret: string,
  role: ProofRole,
  port: number,
  nonce: string,
  candidate: string
): boolean {
  return sameSecret(proof(secret, role, port, nonce), candidate);
}
