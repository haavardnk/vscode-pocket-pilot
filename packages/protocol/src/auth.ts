import { z } from 'zod';

const deviceNameSchema = z.string().trim().min(1).max(64);

export const pairRequestSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
  deviceName: deviceNameSchema
});
export type PairRequest = z.infer<typeof pairRequestSchema>;

export const loginRequestSchema = z.object({
  password: z.string().min(1).max(256),
  deviceName: deviceNameSchema
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const deviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  pairedAt: z.number(),
  lastSeenAt: z.number()
});
export type Device = z.infer<typeof deviceSchema>;

export const connectionSchema = z.enum(['quickTunnel', 'tunnel']);
export type Connection = z.infer<typeof connectionSchema>;

export const authInfoSchema = z.object({
  device: deviceSchema.nullable(),
  passwordEnabled: z.boolean(),
  connection: connectionSchema
});
export type AuthInfo = z.infer<typeof authInfoSchema>;
