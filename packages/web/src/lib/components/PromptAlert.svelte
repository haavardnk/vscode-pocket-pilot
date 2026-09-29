<script lang="ts">
  import type { Component, Snippet } from 'svelte';

  import { getChatContext } from '../chatContext';
  import { markdown } from '../markdown';

  interface Props {
    icon: Component<{ class?: string }>;
    title: string;
    message: string;
    pending: boolean;
    children: Snippet;
  }

  const { icon: Icon, title, message, pending, children }: Props = $props();

  const chat = getChatContext();
</script>

<div
  role={pending ? 'alert' : undefined}
  class={[
    'alert flex flex-col items-stretch gap-2 alert-soft text-sm',
    pending ? 'alert-warning' : 'alert-info'
  ]}
>
  <p class="flex items-center gap-2 font-medium">
    <Icon class="size-4 shrink-0" />{title}
  </p>
  {#if message}<div class="markdown" {@attach markdown(message, chat)}></div>{/if}
  {@render children()}
</div>
