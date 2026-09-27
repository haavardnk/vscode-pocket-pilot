import { z } from 'zod';

import { parseJson } from '../json';

const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

const tokenSchema = z.object({
  a: z.string().min(1),
  t: z.string().min(1),
  s: z.string().min(1)
});

export const namedTunnelSchema = z.object({
  hostname: z.string().regex(HOSTNAME),
  token: z.string().min(1)
});
export type NamedTunnel = z.infer<typeof namedTunnelSchema>;

export function normalizeHostname(input: string): string | null {
  const hostname = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[/?#].*$/, '');
  return HOSTNAME.test(hostname) ? hostname : null;
}

export function parseTunnelToken(input: string): string | null {
  const token = input.trim().split(/\s+/).at(-1) ?? '';
  if (!/^[A-Za-z0-9+/=_-]+$/.test(token)) return null;
  const decoded = parseJson(Buffer.from(token, 'base64').toString('utf8'));
  return tokenSchema.safeParse(decoded).success ? token : null;
}
