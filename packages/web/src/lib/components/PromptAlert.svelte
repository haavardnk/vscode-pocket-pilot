<script lang="ts">
  import type { Component, Snippet } from 'svelte';

  import { getChatRepository } from '../chatRepository';
  import { markdown } from '../markdown';

  interface Props {
    icon: Component<{ class?: string }>;
    title: string;
    message: string;
    pending: boolean;
    children: Snippet;
  }

  const { icon: Icon, title, message, pending, children }: Props = $props();

  const repository = getChatRepository();
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
  {#if message}<div class="markdown" {@attach markdown(message, repository.github)}></div>{/if}
  {@render children()}
</div>
