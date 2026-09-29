import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

import { errorMessage } from '../errors';
import { normalizeHostname } from '../tunnel/named';

export const ACCESS_TOKEN_HEADER = 'cf-access-jwt-assertion';

export interface AccessSettings {
  teamDomain: string;
  audience: string;
  emails: readonly string[];
}

export interface AccessCheck {
  allows(token: unknown): Promise<boolean>;
}

export function accessTeam(input: string): string | null {
  const name = input.trim().toLowerCase();
  return normalizeHostname(/^[a-z0-9-]+$/.test(name) ? `${name}.cloudflareaccess.com` : name);
}

export function accessCheck(
  settings: AccessSettings,
  report: (message: string) => void,
  keys?: JWTVerifyGetKey
): AccessCheck {
  const team = accessTeam(settings.teamDomain);
  if (!team)
    throw new Error(
      'Set pocketPilot.tunnel.access.teamDomain to your Cloudflare Access team name or domain'
    );
  const audience = settings.audience.trim();
  if (!audience)
    throw new Error(
      'Set pocketPilot.tunnel.access.audience to the audience tag of the Access application'
    );
  const issuer = `https://${team}`;
  const jwks = keys ?? createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  const emails = new Set(
    settings.emails.map((email) => email.trim().toLowerCase()).filter((email) => email !== '')
  );
  let lastReason = '';
  const refuse = (reason: string): false => {
    if (reason !== lastReason)
      report(`Cloudflare Access check refused a tunnel request: ${reason}`);
    lastReason = reason;
    return false;
  };

  return {
    allows: async (token) => {
      if (typeof token !== 'string' || token === '') return refuse('it carried no Access token');
      try {
        const { payload } = await jwtVerify(token, jwks, {
          issuer,
          audience,
          algorithms: ['RS256']
        });
        const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
        if (emails.size > 0 && !emails.has(email))
          return refuse(`${email || 'a token without an email'} is not an allowed email`);
        lastReason = '';
        return true;
      } catch (error) {
        return refuse(errorMessage(error));
      }
    }
  };
}
