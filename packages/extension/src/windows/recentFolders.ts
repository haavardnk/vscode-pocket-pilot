import { z } from 'zod';

export const MAX_RECENT = 30;

const uriSchema = z.object({
  scheme: z.string(),
  authority: z.string().optional(),
  path: z.string()
});

const entrySchema = z.union([
  z.object({ folderUri: uriSchema }),
  z.object({ workspace: z.object({ configPath: uriSchema }) })
]);

const recentSchema = z.object({ workspaces: z.array(z.unknown()) });

export interface RecentEntry {
  authority: string;
  path: string;
  kind: 'folder' | 'workspace';
}

export function parseRecents(raw: unknown): RecentEntry[] {
  const parsed = recentSchema.safeParse(raw);
  if (!parsed.success) return [];
  return parsed.data.workspaces
    .flatMap((item): RecentEntry[] => {
      const entry = entrySchema.safeParse(item);
      if (!entry.success) return [];
      const [uri, kind] =
        'folderUri' in entry.data
          ? [entry.data.folderUri, 'folder' as const]
          : [entry.data.workspace.configPath, 'workspace' as const];
      if (uri.scheme !== 'file') return [];
      return [{ authority: uri.authority ?? '', path: uri.path, kind }];
    })
    .slice(0, MAX_RECENT);
}
