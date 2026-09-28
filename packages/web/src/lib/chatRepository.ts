import { createContext } from 'svelte';

import type { GitHubRepository } from './github';

export interface ChatRepository {
  readonly github: GitHubRepository | null;
}

export const [getChatRepository, setChatRepository] = createContext<ChatRepository>();
