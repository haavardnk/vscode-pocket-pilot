import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTPayload,
  type JWTVerifyGetKey,
  SignJWT
} from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { accessCheck, type AccessSettings, accessTeam } from '../src/server/accessCheck';

const ISSUER = 'https://team.cloudflareaccess.com';
const AUDIENCE = 'app-audience';
const SETTINGS: AccessSettings = { teamDomain: 'team', audience: AUDIENCE, emails: [] };

type Key = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

let keys: JWTVerifyGetKey;
let signing: Key;
let stranger: Key;

function token(claims: JWTPayload = {}, key: Key = signing): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: ISSUER,
    aud: AUDIENCE,
    email: 'me@example.com',
    iat: now,
    exp: now + 3600,
    ...claims
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'current' })
    .sign(key);
}

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  signing = pair.privateKey;
  stranger = (await generateKeyPair('RS256')).privateKey;
  keys = createLocalJWKSet({
    keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'current', alg: 'RS256' }]
  });
});

describe('Cloudflare Access check', () => {
  it.each<[string, string | null]>([
    ['team', 'team.cloudflareaccess.com'],
    ['https://Team.cloudflareaccess.com/', 'team.cloudflareaccess.com'],
    ['', null],
    ['my team', null]
  ])('reads the team %j as %j', (input, team) => {
    expect(accessTeam(input)).toBe(team);
  });

  it.each<[string, AccessSettings]>([
    ['team', { ...SETTINGS, teamDomain: '' }],
    ['audience', { ...SETTINGS, audience: ' ' }]
  ])('refuses to start without a %s', (setting, settings) => {
    expect(() => accessCheck(settings, () => undefined, keys)).toThrow(setting);
  });

  it.each<[string, () => Promise<unknown>, readonly string[], boolean]>([
    ['a valid token', () => token(), [], true],
    [
      'an allowed email in any case',
      () => token({ email: 'Me@Example.com' }),
      ['me@example.com'],
      true
    ],
    ['another email', () => token({ email: 'you@example.com' }), ['me@example.com'], false],
    ['another audience', () => token({ aud: 'other' }), [], false],
    ['another issuer', () => token({ iss: 'https://evil.cloudflareaccess.com' }), [], false],
    ['an expired token', () => token({ exp: Math.floor(Date.now() / 1000) - 60 }), [], false],
    ['a token signed by another key', () => token({}, stranger), [], false],
    ['no token', async () => undefined, [], false]
  ])('checks %s', async (_case, make, emails, allowed) => {
    const check = accessCheck({ ...SETTINGS, emails }, () => undefined, keys);
    expect(await check.allows(await make())).toBe(allowed);
  });

  it('reports a repeated refusal once', async () => {
    const report = vi.fn();
    const check = accessCheck(SETTINGS, report, keys);
    await check.allows(undefined);
    await check.allows(undefined);
    expect(report).toHaveBeenCalledTimes(1);
  });
});
