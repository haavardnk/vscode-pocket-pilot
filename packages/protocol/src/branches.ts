import { z } from 'zod';

const folderTarget = { windowId: z.string(), folderId: z.string() };

export const localBranchSchema = z.object({
  name: z.string(),
  commit: z.string().nullable(),
  worktree: z.string().nullable()
});

export const remoteBranchSchema = z.object({
  remote: z.string(),
  name: z.string(),
  commit: z.string().nullable()
});

export const branchQuerySchema = z.object({ kind: z.literal('branches'), ...folderTarget });

export const branchResultSchema = z.object({
  kind: z.literal('branches'),
  current: z.string().nullable(),
  local: z.array(localBranchSchema),
  remote: z.array(remoteBranchSchema)
});

export const branchCommandSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('checkoutBranch'),
    ...folderTarget,
    name: z.string().min(1).max(255),
    remote: z.string().min(1).max(255).nullable(),
    stash: z.boolean()
  }),
  z.object({ kind: z.literal('createBranch'), ...folderTarget, name: z.string().min(1).max(255) }),
  z.object({ kind: z.literal('fetchBranches'), ...folderTarget })
]);

const FORBIDDEN_CHARACTERS = /[\s~^:?*[\\\p{Cc}]/u;

export function branchNameError(name: string): string | null {
  if (name === '') return 'Enter a branch name';
  if (name.length > 255) return 'Branch names can be at most 255 characters';
  if (name === 'HEAD' || name === '@') return `${name} is reserved by Git`;
  if (FORBIDDEN_CHARACTERS.test(name))
    return 'Branch names cannot contain spaces or ~ ^ : ? * [ \\';
  if (name.startsWith('-')) return 'Branch names cannot start with -';
  if (name.includes('..') || name.includes('@{')) return 'Branch names cannot contain .. or @{';
  if (name.endsWith('.')) return 'Branch names cannot end with .';
  if (
    name.split('/').some((part) => part === '' || part.startsWith('.') || part.endsWith('.lock'))
  ) {
    return 'Each part between slashes must be non-empty, not start with . and not end with .lock';
  }
  return null;
}

export type LocalBranch = z.infer<typeof localBranchSchema>;
export type RemoteBranch = z.infer<typeof remoteBranchSchema>;
export type BranchQuery = z.infer<typeof branchQuerySchema>;
export type BranchResult = z.infer<typeof branchResultSchema>;
export type BranchCommand = z.infer<typeof branchCommandSchema>;
