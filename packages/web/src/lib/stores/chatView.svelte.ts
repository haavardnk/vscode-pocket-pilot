const STORAGE_KEY = 'pocket-pilot-compact-chats';

class ChatViewStore {
  compact = $state(localStorage.getItem(STORAGE_KEY) === 'true');

  setCompact(compact: boolean): void {
    this.compact = compact;
    if (compact) localStorage.setItem(STORAGE_KEY, 'true');
    else localStorage.removeItem(STORAGE_KEY);
  }
}

export const chatView = new ChatViewStore();
