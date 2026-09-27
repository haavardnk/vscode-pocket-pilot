<script lang="ts">
  import FolderGit from '@lucide/svelte/icons/folder-git-2';
  import SquareTerminal from '@lucide/svelte/icons/square-terminal';

  import { type TerminalTarget, terminalTargets, windowsForRepository } from '../../hub/views';
  import { hub } from '../../stores/hub.svelte';
  import { router } from '../../stores/router.svelte';
  import { toasts } from '../../stores/toasts.svelte';
  import Sheet from '../Sheet.svelte';

  interface Props {
    open: boolean;
    onclose: () => void;
  }

  const { open, onclose }: Props = $props();

  const windows = $derived(windowsForRepository(hub.windows, hub.groups, hub.repository));
  const targets = $derived(terminalTargets(windows));
  const showWindow = $derived(windows.length > 1);
  const disabled = $derived(hub.connection !== 'open');

  function create({ windowId, folderId }: TerminalTarget): void {
    onclose();
    const terminalId = crypto.randomUUID();
    hub.command({ kind: 'createTerminal', windowId, terminalId, folderId }).then(
      () => router.go({ name: 'terminal', windowId, terminalId, executionId: null }),
      (error: unknown) => toasts.error(error)
    );
  }
</script>

<Sheet {open} title="New terminal" {onclose}>
  <ul class="menu w-full p-0">
    {#each targets as target (`${target.windowId}/${target.folderId}`)}
      <li>
        <button class="py-3" {disabled} onclick={() => create(target)}>
          {#if target.folderId}
            <FolderGit class="size-4 shrink-0" />
          {:else}
            <SquareTerminal class="size-4 shrink-0" />
          {/if}
          <span class="flex min-w-0 flex-col items-start">
            <span class="truncate">{target.name}</span>
            {#if showWindow && target.folderId}
              <span class="truncate text-xs text-base-content/60">{target.windowName}</span>
            {/if}
          </span>
        </button>
      </li>
    {/each}
  </ul>
</Sheet>
