import type { BranchResult, LocalBranch, RemoteBranch } from '@pocket-pilot/protocol';

export interface BranchTarget {
  name: string;
  remote: string | null;
}

export interface BranchSections {
  local: LocalBranch[];
  remote: RemoteBranch[];
}

export function remoteLabel(branch: RemoteBranch): string {
  return `${branch.remote}/${branch.name}`;
}

export function branchSections(result: BranchResult, search: string): BranchSections {
  const needle = search.trim().toLowerCase();
  const matches = (label: string): boolean => !needle || label.toLowerCase().includes(needle);
  return {
    local: result.local
      .filter((branch) => matches(branch.name))
      .sort((a, b) => Number(b.name === result.current) - Number(a.name === result.current)),
    remote: result.remote.filter((branch) => matches(remoteLabel(branch)))
  };
}
