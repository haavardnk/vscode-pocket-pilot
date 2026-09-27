<script lang="ts">
  import type { AuthInfo, Connection, Device } from '@pocket-pilot/protocol';

  import TabBar from '../lib/components/TabBar.svelte';
  import { routeHash, type Tab, TABS } from '../lib/routing';
  import { router } from '../lib/stores/router.svelte';
  import RouteView from './RouteView.svelte';

  interface Props {
    device: Device;
    connection: Connection;
    onsignedout: (info: AuthInfo) => void;
  }

  const { device, connection, onsignedout }: Props = $props();

  const scrolls: Partial<Record<Tab, number>> = {};
  let shownTab = router.tab;
  let shownHash = routeHash(router.route);

  $effect.pre(() => {
    if (router.tab !== shownTab) scrolls[shownTab] = scrollY;
  });

  $effect(() => {
    const tab = router.tab;
    const hash = routeHash(router.route);
    if (tab !== shownTab) {
      document
        .querySelectorAll<HTMLDialogElement>(`[data-tab="${shownTab}"] dialog[open]`)
        .forEach((dialog) => dialog.close());
      scrollTo({ top: scrolls[tab] ?? 0 });
    } else if (hash !== shownHash) {
      scrollTo({ top: 0 });
    }
    shownTab = tab;
    shownHash = hash;
  });

  function keepTyping(event: MouseEvent): void {
    if (!(event.target instanceof Element) || !event.target.closest('button')) return;
    if (document.activeElement?.matches('textarea, input')) event.preventDefault();
  }
</script>

<svelte:document onmousedown={keepTyping} />

{#each TABS as tab (tab)}
  {@const route = router.routes[tab]}
  {#if route}
    <div
      class="flex min-h-dvh flex-col pb-(--dock-height)"
      hidden={tab !== router.tab}
      data-tab={tab}
    >
      <RouteView {route} {device} {connection} {onsignedout} />
    </div>
  {/if}
{/each}

<TabBar />
