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

  let container = $state<HTMLElement>();
  let element = $state<HTMLElement>();
  let top = 0;
  let shownHash = '';

  setPane({
    get element() {
      return element;
    },
    scroller: (node) => {
      element = node;
      const save = (): void => {
        if (active) top = node.scrollTop;
      };
      node.addEventListener('scroll', save, { passive: true });
      return () => {
        node.removeEventListener('scroll', save);
        if (element === node) element = undefined;
      };
    }
  });

  $effect(() => {
    const hash = routeHash(route);
    if (!active) {
      container
        ?.querySelectorAll<HTMLDialogElement>('dialog[open]')
        .forEach((dialog) => dialog.close());
      return;
    }
    if (!element) return;
    if (hash !== shownHash) top = 0;
    element.scrollTop = top;
    shownHash = hash;
  });
</script>

<div
  class="flex h-full flex-col overflow-hidden pb-(--dock-height)"
  hidden={!active}
  data-tab={tab}
  bind:this={container}
>
  <RouteView {route} {device} {connection} {onsignedout} />
</div>
