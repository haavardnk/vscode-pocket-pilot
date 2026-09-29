import { z } from 'zod';

import { requestImageSchema } from './images.ts';
import { terminalRefSchema, terminalSummarySchema } from './terminal.ts';

export const repositorySchema = z.object({
  key: z.string(),
  label: z.string(),
  github: z.object({ owner: z.string(), name: z.string() }).nullable()
});

export const gitUpstreamSchema = z.object({
  remote: z.string(),
  branch: z.string(),
  ahead: z.number().int(),
  behind: z.number().int()
});

export const gitStatusSchema = z.object({
  branch: z.string().nullable(),
  commit: z.string().nullable(),
  upstream: gitUpstreamSchema.nullable(),
  changed: z.number().int()
});

export const workspaceFolderSchema = z.object({
  id: z.string(),
  name: z.string(),
  repositoryKey: z.string().nullable(),
  git: gitStatusSchema.nullable()
});

export const sessionStatusSchema = z.enum(['idle', 'running', 'needsInput', 'failed']);

export const requestStateSchema = z.enum([
  'pending',
  'complete',
  'cancelled',
  'failed',
  'needsInput'
]);

export const sessionSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  status: sessionStatusSchema,
  lastRequestState: requestStateSchema.nullable(),
  modelId: z.string().nullable(),
  modeId: z.string().nullable(),
  requestCount: z.number(),
  preview: z.string().nullable(),
  pinned: z.boolean(),
  archived: z.boolean()
});

export const permissionLevelSchema = z.enum(['default', 'autoApprove', 'autopilot']);

export const optionValueSchema = z.union([z.string(), z.number(), z.boolean()]);

export const questionSchema = z.object({
  id: z.string(),
  type: z.enum(['text', 'singleSelect', 'multiSelect']),
  title: z.string(),
  message: z.string().nullable(),
  options: z.array(z.object({ id: z.string(), label: z.string(), value: optionValueSchema })),
  defaultValue: z.union([optionValueSchema, z.array(optionValueSchema)]).nullable(),
  allowFreeformInput: z.boolean(),
  required: z.boolean()
});

export const questionAnswerSchema = z.union([
  z.string().max(10_000),
  z.strictObject({
    selectedValues: z.array(optionValueSchema).max(100),
    freeformValue: z.string().max(10_000).optional()
  }),
  z.strictObject({
    selectedValue: optionValueSchema.optional(),
    freeformValue: z.string().max(10_000).optional()
  })
]);

export const questionAnswersSchema = z.record(z.string(), questionAnswerSchema);

export const interactionStateSchema = z.enum(['pending', 'done', 'expired']);

export const toolStatusSchema = z.enum(['running', 'done', 'failed']);

export const subagentSchema = z.object({
  agentName: z.string().nullable(),
  description: z.string(),
  model: z.string().nullable(),
  result: z.string().nullable()
});

export const todoItemSchema = z.object({
  title: z.string(),
  status: z.enum(['notStarted', 'inProgress', 'completed'])
});

export const toolLinkSchema = z.object({ label: z.string(), uri: z.string() });

export const responsePartSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('markdown'), text: z.string(), baseUri: z.string().nullable() }),
  z.object({ kind: z.literal('thinking'), text: z.string(), title: z.string().nullable() }),
  z.object({
    kind: z.literal('tool'),
    callId: z.string(),
    toolId: z.string(),
    message: z.string(),
    detail: z.string().nullable(),
    links: z.array(toolLinkSchema),
    title: z.string().nullable(),
    grouped: z.boolean(),
    awaitingConfirmation: z.boolean(),
    status: toolStatusSchema,
    terminal: terminalRefSchema.nullable(),
    subagent: subagentSchema.nullable(),
    parentCallId: z.string().nullable()
  }),
  z.object({
    kind: z.literal('edit'),
    path: z.string(),
    stopId: z.string().nullable(),
    callId: z.string().nullable(),
    additions: z.number().nullable(),
    deletions: z.number().nullable()
  }),
  z.object({ kind: z.literal('progress'), text: z.string() }),
  z.object({
    kind: z.literal('questions'),
    resolveId: z.string().nullable(),
    allowSkip: z.boolean(),
    state: interactionStateSchema,
    questions: z.array(questionSchema),
    answers: questionAnswersSchema.nullable()
  }),
  z.object({
    kind: z.literal('confirmation'),
    title: z.string(),
    message: z.string(),
    buttons: z.array(z.string()),
    state: interactionStateSchema
  }),
  z.object({
    kind: z.literal('elicitation'),
    title: z.string(),
    message: z.string(),
    state: z.enum(['pending', 'accepted', 'rejected', 'expired'])
  })
]);

export const requestViewSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  message: z.string(),
  modelId: z.string().nullable(),
  agentName: z.string().nullable(),
  state: requestStateSchema,
  error: z.string().nullable(),
  editable: z.boolean(),
  disabled: z.boolean(),
  editedPaths: z.array(z.string()),
  images: z.array(requestImageSchema),
  parts: z.array(responsePartSchema)
});

export const deliverySchema = z.enum(['queued', 'steering']);

export const queuedRequestSchema = z.object({
  id: z.string(),
  delivery: deliverySchema,
  text: z.string(),
  modeId: z.string().nullable(),
  modelId: z.string().nullable(),
  permission: permissionLevelSchema.nullable(),
  images: z.array(requestImageSchema),
  attachments: z.number().int().nonnegative()
});

export const sessionDetailSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: sessionStatusSchema,
  modelId: z.string().nullable(),
  modeId: z.string().nullable(),
  permission: permissionLevelSchema,
  totalRequests: z.number(),
  editedFiles: z.number(),
  todos: z.array(todoItemSchema).nullable(),
  requests: z.array(requestViewSchema),
  queued: z.array(queuedRequestSchema)
});

export const handoffSchema = z.object({
  id: z.string(),
  label: z.string(),
  agent: z.string(),
  prompt: z.string(),
  send: z.boolean()
});

export const agentSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  builtin: z.boolean(),
  handoffs: z.array(handoffSchema)
});

export const modelConfigKeySchema = z.enum(['reasoningEffort', 'contextSize']);

export const configValueSchema = z.union([z.string(), z.number()]);

export const modelConfigOptionSchema = z.object({
  key: modelConfigKeySchema,
  title: z.string(),
  choices: z.array(
    z.object({
      value: configValueSchema,
      label: z.string(),
      description: z.string().nullable()
    })
  ),
  defaultValue: configValueSchema.nullable(),
  value: configValueSchema.nullable()
});

export const modelSchema = z.object({
  id: z.string(),
  vendor: z.string(),
  family: z.string(),
  name: z.string(),
  maxInputTokens: z.number().nullable(),
  vision: z.boolean().nullable(),
  options: z.array(modelConfigOptionSchema)
});

export const windowStateSchema = z.object({
  windowId: z.string(),
  name: z.string(),
  workspace: z.string().nullable(),
  repositories: z.array(repositorySchema),
  folders: z.array(workspaceFolderSchema),
  sessions: z.array(sessionSummarySchema),
  terminals: z.array(terminalSummarySchema),
  canOrganize: z.boolean(),
  agents: z.array(agentSchema),
  models: z.array(modelSchema)
});

export type Repository = z.infer<typeof repositorySchema>;
export type GitUpstream = z.infer<typeof gitUpstreamSchema>;
export type GitStatus = z.infer<typeof gitStatusSchema>;
export type WorkspaceFolder = z.infer<typeof workspaceFolderSchema>;
export type SessionStatus = z.infer<typeof sessionStatusSchema>;
export type SessionSummary = z.infer<typeof sessionSummarySchema>;
export type RequestState = z.infer<typeof requestStateSchema>;
export type PermissionLevel = z.infer<typeof permissionLevelSchema>;
export type OptionValue = z.infer<typeof optionValueSchema>;
export type Question = z.infer<typeof questionSchema>;
export type QuestionAnswer = z.infer<typeof questionAnswerSchema>;
export type QuestionAnswers = z.infer<typeof questionAnswersSchema>;
export type InteractionState = z.infer<typeof interactionStateSchema>;
export type ToolStatus = z.infer<typeof toolStatusSchema>;
export type Subagent = z.infer<typeof subagentSchema>;
export type ToolLink = z.infer<typeof toolLinkSchema>;
export type TodoItem = z.infer<typeof todoItemSchema>;
export type ResponsePart = z.infer<typeof responsePartSchema>;
export type RequestView = z.infer<typeof requestViewSchema>;
export type Delivery = z.infer<typeof deliverySchema>;
export type QueuedRequest = z.infer<typeof queuedRequestSchema>;
export type SessionDetail = z.infer<typeof sessionDetailSchema>;
export type Handoff = z.infer<typeof handoffSchema>;
export type Agent = z.infer<typeof agentSchema>;
export type ModelConfigKey = z.infer<typeof modelConfigKeySchema>;
export type ConfigValue = z.infer<typeof configValueSchema>;
export type ModelConfigOption = z.infer<typeof modelConfigOptionSchema>;
export type Model = z.infer<typeof modelSchema>;
export type WindowState = z.infer<typeof windowStateSchema>;
