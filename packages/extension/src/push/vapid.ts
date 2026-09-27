import webpush from 'web-push';
import { z } from 'zod';

import { parseJson } from '../json';
import { createOnce } from '../storage/sharedFile';

const vapidKeysSchema = z.object({ publicKey: z.string().min(1), privateKey: z.string().min(1) });

export type VapidKeys = z.infer<typeof vapidKeysSchema>;

export async function vapidKeys(file: string): Promise<VapidKeys> {
  const text = await createOnce(file, () => `${JSON.stringify(webpush.generateVAPIDKeys())}\n`);
  return vapidKeysSchema.parse(parseJson(text));
}
