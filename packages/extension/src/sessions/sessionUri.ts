export const LOCAL_SESSION_SCHEME = 'vscode-chat-session';
export const LOCAL_SESSION_AUTHORITY = 'local';

const LOCAL_PREFIX = `${LOCAL_SESSION_SCHEME}://${LOCAL_SESSION_AUTHORITY}/`;
const ENCODED_ID = /^[\w-]+$/;

export function localSessionPath(sessionId: string): string {
  return `/${Buffer.from(sessionId).toString('base64url')}`;
}

export function localSessionId(resource: string): string | null {
  if (!resource.startsWith(LOCAL_PREFIX)) return null;
  const encoded = resource.slice(LOCAL_PREFIX.length);
  return ENCODED_ID.test(encoded) ? Buffer.from(encoded, 'base64url').toString() : null;
}
