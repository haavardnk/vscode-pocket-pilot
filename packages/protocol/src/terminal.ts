import { z } from 'zod';

export const SEGMENT_BOLD = 1;
export const SEGMENT_DIM = 2;
export const SEGMENT_ITALIC = 4;
export const SEGMENT_UNDERLINE = 8;
export const SEGMENT_INVERSE = 16;
export const SEGMENT_STRIKETHROUGH = 32;

export const terminalSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  cwd: z.string().nullable(),
  shell: z.string().nullable(),
  agent: z.boolean(),
  sessionId: z.string().nullable(),
  command: z.string().nullable(),
  lastExitCode: z.number().nullable(),
  owned: z.boolean(),
  home: z.boolean(),
  exited: z.boolean()
});

export const terminalColorSchema = z
  .union([z.number().int().min(0).max(255), z.string().regex(/^#[0-9a-f]{6}$/)])
  .nullable();

export const terminalSegmentSchema = z.object({
  text: z.string(),
  fg: terminalColorSchema,
  bg: terminalColorSchema,
  flags: z.number().int().min(0)
});

export const terminalLineSchema = z.array(terminalSegmentSchema);

const executionFields = {
  id: z.string(),
  command: z.string(),
  cwd: z.string().nullable(),
  startedAt: z.number(),
  endedAt: z.number().nullable(),
  exitCode: z.number().nullable(),
  sessionId: z.string().nullable(),
  callId: z.string().nullable(),
  alternate: z.boolean(),
  dropped: z.number().int().min(0),
  tail: z.array(terminalLineSchema)
};

export const terminalExecutionSchema = z.object({
  ...executionFields,
  lines: z.array(terminalLineSchema)
});

export const terminalStreamSchema = z.object({
  dropped: z.number().int().min(0),
  lines: z.array(terminalLineSchema),
  tail: z.array(terminalLineSchema),
  alternate: z.boolean()
});

export const terminalDetailSchema = z.object({
  id: z.string(),
  dropped: z.number().int().min(0),
  executions: z.array(terminalExecutionSchema),
  stream: terminalStreamSchema.nullable()
});

export const executionPatchSchema = z.object({
  ...executionFields,
  append: z.array(terminalLineSchema)
});

export const streamPatchSchema = z.object({
  dropped: z.number().int().min(0),
  append: z.array(terminalLineSchema),
  tail: z.array(terminalLineSchema),
  alternate: z.boolean()
});

export const terminalPatchSchema = z.object({
  dropped: z.number().int().min(0),
  executions: z.array(executionPatchSchema),
  stream: streamPatchSchema.nullable()
});

export const terminalRefSchema = z.object({
  terminalId: z.string(),
  executionId: z.string()
});

export type TerminalSummary = z.infer<typeof terminalSummarySchema>;
export type TerminalColor = z.infer<typeof terminalColorSchema>;
export type TerminalSegment = z.infer<typeof terminalSegmentSchema>;
export type TerminalLine = z.infer<typeof terminalLineSchema>;
export type TerminalExecution = z.infer<typeof terminalExecutionSchema>;
export type TerminalStream = z.infer<typeof terminalStreamSchema>;
export type TerminalDetail = z.infer<typeof terminalDetailSchema>;
export type ExecutionPatch = z.infer<typeof executionPatchSchema>;
export type StreamPatch = z.infer<typeof streamPatchSchema>;
export type TerminalPatch = z.infer<typeof terminalPatchSchema>;
export type TerminalRef = z.infer<typeof terminalRefSchema>;

export function applyTerminalPatch(detail: TerminalDetail, patch: TerminalPatch): void {
  detail.executions.splice(0, patch.dropped - detail.dropped);
  detail.dropped = patch.dropped;
  for (const { append, ...fields } of patch.executions) {
    const execution = detail.executions.find((item) => item.id === fields.id);
    if (!execution) {
      detail.executions.push({ ...fields, lines: append });
      continue;
    }
    execution.lines.splice(0, fields.dropped - execution.dropped);
    execution.lines.push(...append);
    Object.assign(execution, fields);
  }
  if (!patch.stream) return;
  const { append, ...fields } = patch.stream;
  if (!detail.stream) {
    detail.stream = { ...fields, lines: append };
    return;
  }
  detail.stream.lines.splice(0, fields.dropped - detail.stream.dropped);
  detail.stream.lines.push(...append);
  Object.assign(detail.stream, fields);
}
