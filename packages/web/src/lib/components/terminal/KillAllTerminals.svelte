<script lang="ts">
  import Trash from '@lucide/svelte/icons/trash';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

  import { homeTerminals, windowsForRepository } from '../../hub/views';
  import { hub } from '../../stores/hub.svelte';
  import { toasts } from '../../stores/toasts.svelte';
  import Sheet from '../Sheet.svelte';

  let open = $state(false);

  const windows = $derived(
    windowsForRepository(hub.windows, hub.groups, hub.repository).filter(
      (window) => window.terminals.length > 0
    )
  );
  const strayHome = $derived(
    homeTerminals(hub.windows).filter(
      ({ windowId }) => !windows.some((window) => window.windowId === windowId)
    )
  );
  const terminals = $derived([
    ...windows.flatMap((window) => window.terminals),
    ...strayHome.map(({ terminal }) => terminal)
  ]);
  const running = $derived(terminals.filter((terminal) => terminal.command).length);
  const closes = $derived(`closes ${terminals.length === 1 ? 'it' : 'them'} in VS Code.`);

  function kill(): void {
    open = false;
    void Promise.allSettled([
      ...windows.map((window) => hub.command({ kind: 'killTerminals', windowId: window.windowId })),
      ...strayHome.map(({ windowId, terminal }) =>
        hub.command({ kind: 'killTerminal', windowId, terminalId: terminal.id })
      )
    ]).then((results) => {
      const failed = results.find((result) => result.status === 'rejected');
      if (failed) toasts.error(failed.reason);
    });
  }
</script>

{#if terminals.length > 0}
  <button
    class="btn btn-square btn-ghost btn-sm"
    aria-label="Kill all terminals"
    disabled={hub.connection !== 'open'}
    onclick={() => (open = true)}
  >
    <Trash class="size-4" />
  </button>
{/if}

<Sheet {open} title="Kill all terminals" onclose={() => (open = false)}>
  <div role="alert" class="alert flex flex-col items-stretch gap-3 alert-soft alert-error">
    <p class="flex items-center gap-2 font-medium">
      <TriangleAlert class="size-4 shrink-0" />Kill {terminals.length === 1
        ? '1 terminal'
        : `all ${terminals.length} terminals`}?
    </p>
    <p class="text-sm">
      {running === 0
        ? `This ${closes}`
        : `This stops ${running === 1 ? '1 running command' : `${running} running commands`} and ${closes}`}
    </p>
    <div class="flex gap-2">
      <button class="btn flex-1 btn-error btn-sm" onclick={kill}>Kill all</button>
      <button class="btn flex-1 btn-sm" onclick={() => (open = false)}>Cancel</button>
    </div>
  </div>
</Sheet>
