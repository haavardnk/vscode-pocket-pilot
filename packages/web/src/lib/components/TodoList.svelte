<script lang="ts">
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Circle from '@lucide/svelte/icons/circle';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import CircleDot from '@lucide/svelte/icons/circle-dot';
  import type { TodoItem } from '@pocket-pilot/protocol';

  interface Props {
    todos: TodoItem[];
  }

  const { todos }: Props = $props();

  let open = $state(false);

  const done = $derived(todos.filter((todo) => todo.status === 'completed').length);
  const current = $derived(todos.find((todo) => todo.status === 'inProgress'));
</script>

<section class="flex flex-col gap-1">
  <button
    class="flex min-w-0 items-center gap-1 self-start text-xs font-medium text-base-content/60"
    aria-expanded={open}
    aria-controls="todo-list"
    onclick={() => (open = !open)}
  >
    <ChevronRight class={['size-3.5 shrink-0 transition-transform', open && 'rotate-90']} />
    <span class="shrink-0">Todos ({done}/{todos.length})</span>
    {#if !open && current}<span class="min-w-0 truncate font-normal">{current.title}</span>{/if}
  </button>
  {#if open}
    <ol id="todo-list" class="flex max-h-48 flex-col gap-1 overflow-y-auto pl-1" aria-label="Todos">
      {#each todos as todo, index (index)}
        <li class="flex items-start gap-2 text-sm">
          {#if todo.status === 'completed'}
            <span class="mt-0.5 shrink-0 text-success" role="img" aria-label="Completed">
              <CircleCheck class="size-4" />
            </span>
          {:else if todo.status === 'inProgress'}
            <span class="mt-0.5 shrink-0 text-primary" role="img" aria-label="In progress">
              <CircleDot class="size-4" />
            </span>
          {:else}
            <span class="mt-0.5 shrink-0 text-base-content/40" role="img" aria-label="Not started">
              <Circle class="size-4" />
            </span>
          {/if}
          <span
            class={[
              'min-w-0 flex-1',
              todo.status === 'completed' && 'text-base-content/50 line-through',
              todo.status === 'inProgress' && 'font-medium'
            ]}>{todo.title}</span
          >
        </li>
      {/each}
    </ol>
  {/if}
</section>
