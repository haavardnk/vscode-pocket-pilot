export type Token = [text: string, style: number];

export interface Highlighted {
  styles: string[];
  lines: Token[][];
}

export interface HighlightRequest {
  id: number;
  code: string;
  languageId: string | null;
  path: string;
}

export interface HighlightResponse {
  id: number;
  result: Highlighted | null;
}

const waiting = new Map<number, (result: Highlighted | null) => void>();
let worker: Worker | null = null;
let nextId = 0;

function settleAll(): void {
  for (const resolve of waiting.values()) resolve(null);
  waiting.clear();
}

function startWorker(): Worker {
  const created = new Worker(new URL('./highlight.worker.ts', import.meta.url), {
    type: 'module'
  });
  created.addEventListener('message', (event: MessageEvent<HighlightResponse>) => {
    waiting.get(event.data.id)?.(event.data.result);
    waiting.delete(event.data.id);
  });
  created.addEventListener('error', settleAll);
  return created;
}

export function highlight(
  code: string,
  languageId: string | null,
  path: string
): Promise<Highlighted | null> {
  worker ??= startWorker();
  const target = worker;
  nextId += 1;
  const id = nextId;
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    target.postMessage({ id, code, languageId, path } satisfies HighlightRequest);
  });
}
