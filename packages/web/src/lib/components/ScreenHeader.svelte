<script lang="ts">
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import type { Snippet } from 'svelte';

  import type { Route } from '../routing';
  import { router } from '../stores/router.svelte';
  import ConnectionBanner from './ConnectionBanner.svelte';

  interface Props {
    title: string;
    subtitle?: string | null;
    back: Route;
    meta?: Snippet;
    actions?: Snippet;
    children?: Snippet;
  }

  const { title, subtitle = null, back, meta, actions, children }: Props = $props();
</script>

<header class="sticky top-0 z-20 bg-base-100/90 pt-safe backdrop-blur">
  <div class="flex h-14 items-center gap-1 px-2">
    <button class="btn btn-square btn-ghost" aria-label="Back" onclick={() => router.go(back)}>
      <ChevronLeft class="size-6" />
    </button>
    <div class="min-w-0 flex-1">
      <h1 class="truncate font-semibold">{title}</h1>
      {#if meta}
        {@render meta()}
      {:else if subtitle}
        <p class="truncate text-xs text-base-content/60">{subtitle}</p>
      {/if}
    </div>
    {@render actions?.()}
  </div>
  {@render children?.()}
  <ConnectionBanner />
</header>
