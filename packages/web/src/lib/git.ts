import type { GitStatus, WindowState } from '@pocket-pilot/protocol';

export function shortCommit(commit: string): string {
  return commit.slice(0, 7);
}

export function refLabel(git: GitStatus): string | null {
  return git.branch ?? (git.commit ? shortCommit(git.commit) : null);
}

export function windowRef(window: WindowState): string | null {
  const [only, ...rest] = new Set(
    window.folders.flatMap((folder) => {
      const label = folder.git && refLabel(folder.git);
      return label ? [label] : [];
    })
  );
  return only && rest.length === 0 ? only : null;
}
