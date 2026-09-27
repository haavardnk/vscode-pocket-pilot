import { z } from 'zod';

const pathField = z.string().max(4096);
const folderTarget = { windowId: z.string(), folderId: z.string() };
const sessionTarget = { windowId: z.string(), sessionId: z.string() };

export const fileChangeSchema = z.enum([
  'modified',
  'added',
  'deleted',
  'renamed',
  'untracked',
  'conflicted'
]);

export const editStateSchema = z.enum(['pending', 'kept', 'undone']);

export const baselineSchema = z.enum(['session', 'commit', 'none']);

export const treeEntrySchema = z.object({
  name: z.string(),
  directory: z.boolean(),
  ignored: z.boolean(),
  change: fileChangeSchema.nullable()
});

export const fileContentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string() }),
  z.object({ kind: z.literal('image'), mime: z.string(), data: z.string() }),
  z.object({ kind: z.literal('binary') }),
  z.object({ kind: z.literal('tooLarge') }),
  z.object({ kind: z.literal('missing') })
]);

export const diffHunkSchema = z.object({
  oldStart: z.number(),
  newStart: z.number(),
  lines: z.array(z.string())
});

export const diffContentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), hunks: z.array(diffHunkSchema) }),
  z.object({ kind: z.literal('binary') }),
  z.object({ kind: z.literal('tooLarge') })
]);

export const gitChangeSchema = z.object({
  path: z.string(),
  previousPath: z.string().nullable(),
  change: fileChangeSchema,
  additions: z.number().nullable(),
  deletions: z.number().nullable()
});

export const sessionChangeSchema = z.object({
  path: z.string(),
  label: z.string(),
  folderId: z.string().nullable(),
  relativePath: z.string().nullable(),
  change: z.enum(['modified', 'added', 'deleted']),
  state: editStateSchema,
  baseline: baselineSchema,
  additions: z.number().nullable(),
  deletions: z.number().nullable()
});

export const codeQuerySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('tree'), ...folderTarget, path: pathField }),
  z.object({ kind: z.literal('file'), ...folderTarget, path: pathField }),
  z.object({ kind: z.literal('gitChanges'), ...folderTarget }),
  z.object({ kind: z.literal('gitDiff'), ...folderTarget, path: pathField }),
  z.object({ kind: z.literal('sessionChanges'), ...sessionTarget }),
  z.object({ kind: z.literal('sessionDiff'), ...sessionTarget, path: pathField })
]);

export const codeResultSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('tree'),
    entries: z.array(treeEntrySchema),
    truncated: z.boolean()
  }),
  z.object({
    kind: z.literal('file'),
    language: z.string().nullable(),
    size: z.number(),
    change: fileChangeSchema.nullable(),
    content: fileContentSchema
  }),
  z.object({
    kind: z.literal('gitChanges'),
    repository: z.boolean(),
    branch: z.string().nullable(),
    truncated: z.boolean(),
    files: z.array(gitChangeSchema)
  }),
  z.object({
    kind: z.literal('gitDiff'),
    language: z.string().nullable(),
    file: gitChangeSchema.nullable(),
    diff: diffContentSchema
  }),
  z.object({ kind: z.literal('sessionChanges'), files: z.array(sessionChangeSchema) }),
  z.object({
    kind: z.literal('sessionDiff'),
    language: z.string().nullable(),
    file: sessionChangeSchema,
    diff: diffContentSchema
  })
]);

export type FileChange = z.infer<typeof fileChangeSchema>;
export type EditState = z.infer<typeof editStateSchema>;
export type Baseline = z.infer<typeof baselineSchema>;
export type TreeEntry = z.infer<typeof treeEntrySchema>;
export type FileContent = z.infer<typeof fileContentSchema>;
export type DiffHunk = z.infer<typeof diffHunkSchema>;
export type DiffContent = z.infer<typeof diffContentSchema>;
export type GitChange = z.infer<typeof gitChangeSchema>;
export type SessionChange = z.infer<typeof sessionChangeSchema>;
export type CodeQuery = z.infer<typeof codeQuerySchema>;
export type CodeResult = z.infer<typeof codeResultSchema>;
export type CodeResultFor<K extends CodeQuery['kind']> = Extract<CodeResult, { kind: K }>;
