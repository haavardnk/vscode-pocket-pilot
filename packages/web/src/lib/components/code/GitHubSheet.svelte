<script lang="ts">
  import FolderGit2 from '@lucide/svelte/icons/folder-git-2';
  import GitBranch from '@lucide/svelte/icons/git-branch';
  import GitCommitHorizontal from '@lucide/svelte/icons/git-commit-horizontal';
  import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
  import type { GitStatus } from '@pocket-pilot/protocol';

  import { type GitHubLinkKind, githubLinks, type GitHubRepository } from '../../github';
  import Sheet from '../Sheet.svelte';

  interface Props {
    open: boolean;
    github: GitHubRepository;
    git: GitStatus | null;
    onclose: () => void;
  }

  const { open, github, git, onclose }: Props = $props();

  const icons: Record<GitHubLinkKind, typeof GitBranch> = {
    repository: FolderGit2,
    branch: GitBranch,
    commit: GitCommitHorizontal,
    pullRequests: GitPullRequest
  };
</script>

<Sheet {open} title="Open on GitHub" {onclose}>
  <ul class="menu w-full p-0">
    {#each githubLinks(github, git) as link (link.kind)}
      {@const Icon = icons[link.kind]}
      <li>
        <a
          class="py-3"
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          onclick={onclose}
        >
          <Icon class="size-4" />
          <span class="flex min-w-0 flex-col">
            <span>{link.label}</span>
            <span class="truncate text-xs text-base-content/60">{link.detail}</span>
          </span>
        </a>
      </li>
    {/each}
  </ul>
</Sheet>
