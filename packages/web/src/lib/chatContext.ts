import { createContext } from 'svelte';

import type { GitHubRepository } from './github';
import { routeHash } from './routing';

export interface ChatContext {
  readonly github: GitHubRepository | null;
  readonly windowId: string;
  readonly sessionId: string;
}

export const [getChatContext, setChatContext] = createContext<ChatContext>();

export function chatFileHref(chat: ChatContext, url: URL): string {
  const line = /^#L?(\d+)/.exec(url.hash)?.[1];
  const file = new URL(url);
  file.hash = '';
  return routeHash({
    name: 'chatFile',
    windowId: chat.windowId,
    sessionId: chat.sessionId,
    uri: file.href,
    line: line ? Number(line) : null
  });
}
