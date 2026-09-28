<script lang="ts">
  import type { AuthInfo, Connection, Device } from '@pocket-pilot/protocol';

  import TabBar from '../lib/components/TabBar.svelte';
  import { TABS } from '../lib/routing';
  import { router } from '../lib/stores/router.svelte';
  import { watchViewport } from '../lib/viewport';
  import TabPane from './TabPane.svelte';

  interface Props {
    device: Device;
    connection: Connection;
    onsignedout: (info: AuthInfo) => void;
  }

  const { device, connection, onsignedout }: Props = $props();

  $effect(watchViewport);

  function keepTyping(event: MouseEvent): void {
    if (!(event.target instanceof Element) || !event.target.closest('button')) return;
    if (document.activeElement?.matches('textarea, input')) event.preventDefault();
  }
</script>

<svelte:document onmousedown={keepTyping} />

<div
  class="fixed top-(--viewport-top) right-[env(safe-area-inset-right)] left-[env(safe-area-inset-left)] h-(--viewport-height)"
>
  {#each TABS as tab (tab)}
    {@const route = router.routes[tab]}
    {#if route}
      <TabPane {tab} {route} active={tab === router.tab} {device} {connection} {onsignedout} />
    {/if}
  {/each}
</div>

<TabBar />
