import {
  type AuthInfo,
  authInfoSchema,
  type LoginRequest,
  type PairRequest
} from '@pocket-pilot/protocol';

import { request } from './http';

async function call(path: string, init?: RequestInit): Promise<AuthInfo> {
  return authInfoSchema.parse(await request(path, init));
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
