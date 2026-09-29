import { z } from 'zod';

import { branchCommandSchema } from './branches.ts';
import {
  configValueSchema,
  deliverySchema,
  modelConfigKeySchema,
  permissionLevelSchema,
  questionAnswersSchema
} from './domain.ts';

const sessionTarget = { windowId: z.string(), sessionId: z.string() };
const terminalTarget = { windowId: z.string(), terminalId: z.string() };

export const commandSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('send'),
    ...sessionTarget,
    text: z.string().min(1).max(100_000),
    delivery: deliverySchema.nullable()
  }),
  z.object({
    kind: z.literal('setQueue'),
    ...sessionTarget,
    expected: z.array(z.string()).max(100),
    queue: z
      .array(
        z.object({
          id: z.string(),
          delivery: deliverySchema,
          text: z.string().min(1).max(100_000)
        })
      )
      .max(100)
  }),
  z.object({ kind: z.literal('stop'), ...sessionTarget }),
  z.object({ kind: z.literal('setMode'), ...sessionTarget, modeId: z.string().min(1) }),
  z.object({
    kind: z.literal('handoff'),
    ...sessionTarget,
    agentId: z.string().min(1),
    handoffId: z.string().min(1),
    autopilot: z.boolean()
  }),
  z.object({ kind: z.literal('setModel'), ...sessionTarget, modelId: z.string().min(1) }),
  z.object({
    kind: z.literal('toolDecision'),
    ...sessionTarget,
    decision: z.enum(['accept', 'skip'])
  }),
  z.object({
    kind: z.literal('answerQuestions'),
    ...sessionTarget,
    resolveId: z.string().min(1),
    answers: questionAnswersSchema.nullable()
  }),
  z.object({
    kind: z.literal('confirm'),
    ...sessionTarget,
    button: z.string().min(1)
  }),
  z.object({ kind: z.literal('acceptElicitation'), ...sessionTarget }),
  z.object({ kind: z.literal('setPinned'), ...sessionTarget, pinned: z.boolean() }),
  z.object({ kind: z.literal('setArchived'), ...sessionTarget, archived: z.boolean() }),
  z.object({
    kind: z.literal('setPermission'),
    ...sessionTarget,
    level: permissionLevelSchema
  }),
  z.object({
    kind: z.literal('restoreCheckpoint'),
    ...sessionTarget,
    requestId: z.string().min(1)
  }),
  z.object({ kind: z.literal('redoCheckpoint'), ...sessionTarget }),
  z.object({
    kind: z.literal('editDecision'),
    ...sessionTarget,
    decision: z.enum(['keep', 'undo']),
    path: z.string().max(4096).nullable()
  }),
  z.object({
    kind: z.literal('newSession'),
    windowId: z.string(),
    text: z.string().min(1).max(100_000),
    modeId: z.string().nullable(),
    modelId: z.string().nullable()
  }),
  z.object({
    kind: z.literal('setModelConfig'),
    windowId: z.string(),
    modelId: z.string().min(1),
    key: modelConfigKeySchema,
    value: configValueSchema.nullable()
  }),
  z.object({
    kind: z.literal('terminalInput'),
    ...terminalTarget,
    text: z.string().min(1).max(10_000),
    execute: z.boolean()
  }),
  z.object({ kind: z.literal('killTerminal'), ...terminalTarget }),
  z.object({ kind: z.literal('killTerminals'), windowId: z.string() }),
  z.object({
    kind: z.literal('createTerminal'),
    windowId: z.string(),
    terminalId: z.uuid(),
    folderId: z.string().nullable()
  }),
  z.object({ kind: z.literal('closeWindow'), windowId: z.string() }),
  z.object({ kind: z.literal('openWindow'), windowId: z.string(), target: z.string().min(1) }),
  ...branchCommandSchema.options
]);

export type Command = z.infer<typeof commandSchema>;

export const sessionWatchSchema = z.object({
  sessionId: z.string(),
  limit: z.number().int().min(1).max(500)
});

export type SessionWatch = z.infer<typeof sessionWatchSchema>;
