<script lang="ts" generics="T">
  import type { Snippet } from 'svelte';

  import type { QueryResource } from '../stores/query.svelte';

  interface Props {
    resource: QueryResource<T>;
    children: Snippet<[T]>;
  }

  const { resource, children }: Props = $props();
</script>

{#if resource.error}
  <div role="alert" class="m-4 alert alert-soft text-sm alert-error">{resource.error}</div>
{/if}
{#if resource.value !== null}
  {@render children(resource.value)}
{:else if !resource.error}
  <div class="flex justify-center p-10">
    <span class="loading loading-spinner text-primary" aria-label="Loading"></span>
  </div>
{/if}
