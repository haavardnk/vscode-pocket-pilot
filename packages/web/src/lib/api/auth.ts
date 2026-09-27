import {
  type AuthInfo,
  authInfoSchema,
  type LoginRequest,
  type PairRequest
} from '@pocket-pilot/protocol';

export class AuthError extends Error {}

async function call(path: string, init?: RequestInit): Promise<AuthInfo> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: init?.body ? { 'content-type': 'application/json' } : undefined
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (body as { error?: unknown } | null)?.error;
    throw new AuthError(
      typeof message === 'string' ? message : `Request failed (${response.status})`
    );
  }
  return authInfoSchema.parse(body);
}

export function fetchAuth(): Promise<AuthInfo> {
  return call('/api/auth');
}

export function pair(request: PairRequest): Promise<AuthInfo> {
  return call('/api/pair', { method: 'POST', body: JSON.stringify(request) });
}

export function login(request: LoginRequest): Promise<AuthInfo> {
  return call('/api/login', { method: 'POST', body: JSON.stringify(request) });
}

export function logout(): Promise<AuthInfo> {
  return call('/api/logout', { method: 'POST', body: '{}' });
}

export function guessDeviceName(userAgent: string): string {
  if (/iPad/.test(userAgent)) return 'iPad';
  if (/iPhone/.test(userAgent)) return 'iPhone';
  if (/Android/.test(userAgent)) return 'Android phone';
  if (/Macintosh/.test(userAgent)) return 'Mac';
  if (/Windows/.test(userAgent)) return 'Windows PC';
  return 'Browser';
}
