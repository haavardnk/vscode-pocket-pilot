import { z } from 'zod';

export const pushEventSchema = z.enum(['finished', 'needsInput', 'failed']);
export type PushEvent = z.infer<typeof pushEventSchema>;

export const pushEventsSchema = z.object({
  finished: z.boolean(),
  needsInput: z.boolean(),
  failed: z.boolean()
});
export type PushEvents = z.infer<typeof pushEventsSchema>;

export const pushSubscriptionSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(64)
  })
});
export type PushSubscriptionInfo = z.infer<typeof pushSubscriptionSchema>;

export const pushRegistrationSchema = z.object({
  subscription: pushSubscriptionSchema,
  events: pushEventsSchema.nullable()
});
export type PushRegistration = z.infer<typeof pushRegistrationSchema>;

export const pushSettingsSchema = z.object({
  publicKey: z.string(),
  events: pushEventsSchema.nullable()
});
export type PushSettings = z.infer<typeof pushSettingsSchema>;

export const pushPayloadSchema = z.object({
  title: z.string(),
  body: z.string(),
  tag: z.string(),
  url: z.string()
});
export type PushPayload = z.infer<typeof pushPayloadSchema>;
