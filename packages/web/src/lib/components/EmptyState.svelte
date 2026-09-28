<script lang="ts">
  import type { Component } from 'svelte';

  interface Props {
    icon: Component<{ class?: string }>;
    title: string;
    hint: string;
  }

  const { icon: Icon, title, hint }: Props = $props();
</script>

<div class="flex flex-col items-center gap-2 px-10 py-16 text-center">
  <span
    class="mb-2 grid size-14 place-items-center rounded-full bg-base-content/10 text-base-content/50"
  >
    <Icon class="size-6" />
  </span>
  <p class="font-medium">{title}</p>
  <p class="text-sm text-base-content/60">{hint}</p>
</div>
