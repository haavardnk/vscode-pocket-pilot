<script lang="ts">
  import type { AuthInfo, Connection, Device } from '@pocket-pilot/protocol';

  import { setPane } from '../lib/pane';
  import { type Route, routeHash, type Tab } from '../lib/routing';
  import RouteView from './RouteView.svelte';

  interface Props {
    tab: Tab;
    route: Route;
    active: boolean;
    device: Device;
    connection: Connection;
    onsignedout: (info: AuthInfo) => void;
  }

  const { tab, route, active, device, connection, onsignedout }: Props = $props();

  let element = $state<HTMLElement>();
  let top = 0;
  let shownHash = '';

  setPane({
    get element() {
      return element;
    }
  });

  $effect(() => {
    const hash = routeHash(route);
    if (!element) return;
    if (!active) {
      element
        .querySelectorAll<HTMLDialogElement>('dialog[open]')
        .forEach((dialog) => dialog.close());
      return;
    }
    element.scrollTop = hash === shownHash ? top : 0;
    shownHash = hash;
  });
</script>

<div
  class="h-full overflow-x-hidden overflow-y-auto overscroll-contain"
  hidden={!active}
  data-tab={tab}
  bind:this={element}
  onscroll={(event) => {
    if (active) top = event.currentTarget.scrollTop;
  }}
>
  <div class="flex min-h-full flex-col pb-(--dock-height)">
    <RouteView {route} {device} {connection} {onsignedout} />
  </div>
</div>
