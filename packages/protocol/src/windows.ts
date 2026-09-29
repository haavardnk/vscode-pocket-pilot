import { z } from 'zod';

export const openTargetSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  kind: z.enum(['folder', 'workspace'])
});

export const windowQuerySchema = z.object({
  kind: z.literal('openTargets'),
  windowId: z.string()
});

export const windowResultSchema = z.object({
  kind: z.literal('openTargets'),
  recent: z.array(openTargetSchema),
  projects: z.array(openTargetSchema)
});

export type OpenTarget = z.infer<typeof openTargetSchema>;
export type WindowQuery = z.infer<typeof windowQuerySchema>;
export type WindowResult = z.infer<typeof windowResultSchema>;
