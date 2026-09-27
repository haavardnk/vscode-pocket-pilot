export interface Toast {
  id: number;
  kind: 'info' | 'error';
  text: string;
}

const DURATION_MS = 4000;

class ToastStore {
  items = $state<Toast[]>([]);
  private next = 1;

  show(text: string, kind: Toast['kind'] = 'info'): void {
    const id = this.next++;
    this.items.push({ id, kind, text });
    setTimeout(() => this.dismiss(id), DURATION_MS);
  }

  error(error: unknown): void {
    this.show(error instanceof Error ? error.message : String(error), 'error');
  }

  dismiss(id: number): void {
    this.items = this.items.filter((item) => item.id !== id);
  }
}

export const toasts = new ToastStore();
