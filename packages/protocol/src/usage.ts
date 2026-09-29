import { z } from 'zod';

export const usageMeterSchema = z.object({
  kind: z.enum(['premium', 'chat', 'completions']),
  usedPercent: z.number().min(0).max(100),
  used: z.number().nullable(),
  total: z.number().nullable(),
  unlimited: z.boolean()
});

export const copilotUsageSchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('ready'),
    plan: z.string().nullable(),
    meters: z.array(usageMeterSchema),
    overage: z.object({ permitted: z.boolean(), count: z.number() }).nullable(),
    resetAt: z.number().nullable(),
    checkedAt: z.number()
  }),
  z.object({ state: z.literal('needsAccess') }),
  z.object({ state: z.literal('unavailable'), reason: z.string() })
]);

export type UsageMeter = z.infer<typeof usageMeterSchema>;
export type CopilotUsage = z.infer<typeof copilotUsageSchema>;
