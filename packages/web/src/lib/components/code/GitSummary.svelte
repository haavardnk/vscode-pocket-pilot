<script lang="ts">
  import GitBranch from '@lucide/svelte/icons/git-branch';
  import type { GitStatus } from '@pocket-pilot/protocol';

  import { refLabel } from '../../git';

  interface Props {
    git: GitStatus;
    id?: string;
  }

  const { git, id }: Props = $props();

  const upstream = $derived(git.upstream);
</script>

<span {id} class="flex min-w-0 items-center gap-1.5 text-xs text-base-content/60">
  <GitBranch class="size-3 shrink-0" />
  <span class="truncate font-mono">{refLabel(git) ?? 'No commits'}</span>
  {#if upstream && upstream.ahead > 0}
    <span class="shrink-0">↑{upstream.ahead}</span>
  {/if}
  {#if upstream && upstream.behind > 0}
    <span class="shrink-0">↓{upstream.behind}</span>
  {/if}
  {#if git.branch && !upstream}
    <span class="shrink-0">· not published</span>
  {/if}
  {#if git.changed > 0}
    <span class="shrink-0">· {git.changed} changed</span>
  {/if}
</span>
