import { pushEventsSchema, pushSubscriptionSchema } from '@pocket-pilot/protocol';
import { z } from 'zod';

import { parseJson } from '../json';
import { readOptional, writeAtomic } from '../storage/sharedFile';

const storedPushSchema = z.object({
  deviceId: z.string(),
  subscription: pushSubscriptionSchema,
  events: pushEventsSchema,
  origin: z.string(),
  createdAt: z.number()
});

export type StoredPush = z.infer<typeof storedPushSchema>;

export class PushStore {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly file: string) {}

  async list(): Promise<StoredPush[]> {
    const text = await readOptional(this.file);
    if (text === null) return [];
    const result = z.array(storedPushSchema).safeParse(parseJson(text));
    return result.success ? result.data : [];
  }

  async get(deviceId: string): Promise<StoredPush | null> {
    return (await this.list()).find((entry) => entry.deviceId === deviceId) ?? null;
  }

  put(entry: StoredPush): Promise<void> {
    return this.update((entries) => [
      ...entries.filter(
        (item) =>
          item.deviceId !== entry.deviceId &&
          item.subscription.endpoint !== entry.subscription.endpoint
      ),
      entry
    ]);
  }

  remove(match: (entry: StoredPush) => boolean): Promise<void> {
    return this.update((entries) => entries.filter((entry) => !match(entry)));
  }

  private update(change: (entries: StoredPush[]) => StoredPush[]): Promise<void> {
    const next = this.queue.then(async () => {
      const entries = await this.list();
      const updated = change(entries);
      if (JSON.stringify(updated) === JSON.stringify(entries)) return;
      await writeAtomic(this.file, `${JSON.stringify(updated, null, 2)}\n`);
    });
    this.queue = next.catch(() => undefined);
    return next;
  }
}
