export type FolderTab = 'files' | 'changes';

export type Tab = 'chats' | 'code' | 'terminals' | 'settings';

export const TABS: Tab[] = ['chats', 'code', 'terminals', 'settings'];

export type Route =
  | { name: 'chats' }
  | { name: 'code' }
  | { name: 'terminals' }
  | { name: 'settings' }
  | { name: 'new' }
  | { name: 'session'; windowId: string; sessionId: string }
  | { name: 'terminal'; windowId: string; terminalId: string; executionId: string | null }
  | { name: 'folder'; windowId: string; folderId: string; tab: FolderTab; path: string }
  | { name: 'file'; windowId: string; folderId: string; path: string }
  | { name: 'gitDiff'; windowId: string; folderId: string; path: string }
  | { name: 'sessionChanges'; windowId: string; sessionId: string; requestId: string | null }
  | {
      name: 'sessionDiff';
      windowId: string;
      sessionId: string;
      path: string;
      requestId: string | null;
    }
  | {
      name: 'editDiff';
      windowId: string;
      sessionId: string;
      requestId: string;
      path: string;
      stopId: string | null;
      callId: string | null;
    };

const STATIC: Record<string, Route> = {
  code: { name: 'code' },
  terminals: { name: 'terminals' },
  settings: { name: 'settings' },
  new: { name: 'new' }
};

export function parseRoute(hash: string): Route {
  const segments = hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const [head = '', first, second, third = '', fourth, fifth, sixth] = segments;
  if (!first || !second) return STATIC[head] ?? { name: 'chats' };
  switch (head) {
    case 'session':
      return { name: 'session', windowId: first, sessionId: second };
    case 'terminal':
      return { name: 'terminal', windowId: first, terminalId: second, executionId: third || null };
    case 'tree':
      return { name: 'folder', windowId: first, folderId: second, tab: 'files', path: third };
    case 'changes':
      return { name: 'folder', windowId: first, folderId: second, tab: 'changes', path: '' };
    case 'file':
      return { name: 'file', windowId: first, folderId: second, path: third };
    case 'diff':
      return { name: 'gitDiff', windowId: first, folderId: second, path: third };
    case 'edits':
      return {
        name: 'sessionChanges',
        windowId: first,
        sessionId: second,
        requestId: third || null
      };
    case 'edit':
      return {
        name: 'sessionDiff',
        windowId: first,
        sessionId: second,
        path: third,
        requestId: fourth || null
      };
    case 'change':
      return third && fourth
        ? {
            name: 'editDiff',
            windowId: first,
            sessionId: second,
            requestId: third,
            path: fourth,
            stopId: fifth || null,
            callId: sixth || null
          }
        : { name: 'session', windowId: first, sessionId: second };
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
    case 'code':
    case 'terminals':
    case 'settings':
    case 'new':
      return `#/${route.name}`;
    case 'session':
      return hashOf('session', route.windowId, route.sessionId);
    case 'terminal':
      return route.executionId
        ? hashOf('terminal', route.windowId, route.terminalId, route.executionId)
        : hashOf('terminal', route.windowId, route.terminalId);
    case 'folder':
      return route.tab === 'changes'
        ? hashOf('changes', route.windowId, route.folderId)
        : hashOf('tree', route.windowId, route.folderId, route.path);
    case 'file':
      return hashOf('file', route.windowId, route.folderId, route.path);
    case 'gitDiff':
      return hashOf('diff', route.windowId, route.folderId, route.path);
    case 'sessionChanges':
      return route.requestId
        ? hashOf('edits', route.windowId, route.sessionId, route.requestId)
        : hashOf('edits', route.windowId, route.sessionId);
    case 'sessionDiff':
      return route.requestId
        ? hashOf('edit', route.windowId, route.sessionId, route.path, route.requestId)
        : hashOf('edit', route.windowId, route.sessionId, route.path);
    case 'editDiff':
      return hashOf(
        'change',
        route.windowId,
        route.sessionId,
        route.requestId,
        route.path,
        route.stopId ?? '',
        route.callId ?? ''
      );
  }
}

export function tabOf(route: Route): Tab {
  switch (route.name) {
    case 'chats':
    case 'code':
    case 'terminals':
    case 'settings':
      return route.name;
    case 'terminal':
      return 'terminals';
    case 'new':
    case 'session':
    case 'sessionChanges':
    case 'sessionDiff':
    case 'editDiff':
      return 'chats';
    case 'folder':
    case 'file':
    case 'gitDiff':
      return 'code';
  }
}

export function inChat(route: Route, windowId: string, sessionId: string): boolean {
  switch (route.name) {
    case 'session':
    case 'sessionChanges':
    case 'sessionDiff':
    case 'editDiff':
      return route.windowId === windowId && route.sessionId === sessionId;
    default:
      return false;
  }
}

export function pairCode(hash: string): string | null {
  return /^#pair=(\d{6})$/.exec(hash)?.[1] ?? null;
}
