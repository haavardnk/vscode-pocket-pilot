import type { Delivery } from '@pocket-pilot/protocol';

const STORAGE_KEY = 'pocket-pilot-compact-chats';
const DELIVERY_KEY = 'pocket-pilot-delivery';

class ChatViewStore {
  compact = $state(localStorage.getItem(STORAGE_KEY) === 'true');
  delivery = $state<Delivery>(
    localStorage.getItem(DELIVERY_KEY) === 'steering' ? 'steering' : 'queued'
  );

  setCompact(compact: boolean): void {
    this.compact = compact;
    if (compact) localStorage.setItem(STORAGE_KEY, 'true');
    else localStorage.removeItem(STORAGE_KEY);
  }

  setDelivery(delivery: Delivery): void {
    this.delivery = delivery;
    if (delivery === 'steering') localStorage.setItem(DELIVERY_KEY, delivery);
    else localStorage.removeItem(DELIVERY_KEY);
  }
}

export const chatView = new ChatViewStore();
