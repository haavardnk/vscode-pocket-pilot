export type Route =
  | { name: 'chats' }
  | { name: 'pullRequests' }
  | { name: 'settings' }
  | { name: 'new' }
  | { name: 'session'; windowId: string; sessionId: string };

export function parseRoute(hash: string): Route {
  const segments = hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const [head, windowId, sessionId] = segments;
  if (head === 'session' && windowId && sessionId) return { name: 'session', windowId, sessionId };
  if (head === 'prs') return { name: 'pullRequests' };
  if (head === 'settings') return { name: 'settings' };
  if (head === 'new') return { name: 'new' };
  return { name: 'chats' };
}

export function routeHash(route: Route): string {
  if (route.name === 'session') {
    return `#/session/${encodeURIComponent(route.windowId)}/${encodeURIComponent(route.sessionId)}`;
  }
  if (route.name === 'pullRequests') return '#/prs';
  if (route.name === 'settings') return '#/settings';
  if (route.name === 'new') return '#/new';
  return '#/';
}

export function pairCode(hash: string): string | null {
  return /^#pair=(\d{6})$/.exec(hash)?.[1] ?? null;
}
