export type FolderTab = 'files' | 'changes';

export type Route =
  | { name: 'chats' }
  | { name: 'pullRequests' }
  | { name: 'code' }
  | { name: 'settings' }
  | { name: 'new' }
  | { name: 'session'; windowId: string; sessionId: string }
  | { name: 'folder'; windowId: string; folderId: string; tab: FolderTab; path: string }
  | { name: 'file'; windowId: string; folderId: string; path: string }
  | { name: 'gitDiff'; windowId: string; folderId: string; path: string }
  | { name: 'sessionChanges'; windowId: string; sessionId: string }
  | { name: 'sessionDiff'; windowId: string; sessionId: string; path: string };

const STATIC: Record<string, Route> = {
  prs: { name: 'pullRequests' },
  code: { name: 'code' },
  settings: { name: 'settings' },
  new: { name: 'new' }
};

export function parseRoute(hash: string): Route {
  const segments = hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const [head = '', first, second, third = ''] = segments;
  if (!first || !second) return STATIC[head] ?? { name: 'chats' };
  switch (head) {
    case 'session':
      return { name: 'session', windowId: first, sessionId: second };
    case 'tree':
      return { name: 'folder', windowId: first, folderId: second, tab: 'files', path: third };
    case 'changes':
      return { name: 'folder', windowId: first, folderId: second, tab: 'changes', path: '' };
    case 'file':
      return { name: 'file', windowId: first, folderId: second, path: third };
    case 'diff':
      return { name: 'gitDiff', windowId: first, folderId: second, path: third };
    case 'edits':
      return { name: 'sessionChanges', windowId: first, sessionId: second };
    case 'edit':
      return { name: 'sessionDiff', windowId: first, sessionId: second, path: third };
    default:
      return { name: 'chats' };
  }
}

function hashOf(...segments: string[]): string {
  return `#/${segments.map(encodeURIComponent).join('/')}`;
}

export function routeHash(route: Route): string {
  switch (route.name) {
    case 'chats':
      return '#/';
    case 'pullRequests':
      return '#/prs';
    case 'code':
    case 'settings':
    case 'new':
      return `#/${route.name}`;
    case 'session':
      return hashOf('session', route.windowId, route.sessionId);
    case 'folder':
      return route.tab === 'changes'
        ? hashOf('changes', route.windowId, route.folderId)
        : hashOf('tree', route.windowId, route.folderId, route.path);
    case 'file':
      return hashOf('file', route.windowId, route.folderId, route.path);
    case 'gitDiff':
      return hashOf('diff', route.windowId, route.folderId, route.path);
    case 'sessionChanges':
      return hashOf('edits', route.windowId, route.sessionId);
    case 'sessionDiff':
      return hashOf('edit', route.windowId, route.sessionId, route.path);
  }
}

export function pairCode(hash: string): string | null {
  return /^#pair=(\d{6})$/.exec(hash)?.[1] ?? null;
}
