<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import type { Agent } from '@pocket-pilot/protocol';

  import Sheet from './Sheet.svelte';

  interface Props {
    open: boolean;
    agents: Agent[];
    current: string | null;
    onselect: (agent: Agent) => void;
    onclose: () => void;
  }

  const { open, agents, current, onselect, onclose }: Props = $props();
</script>

<Sheet {open} title="Agent" {onclose}>
  <ul class="menu w-full p-0">
    {#each agents as agent (agent.id)}
      <li>
        <button class="flex items-start gap-3 py-3" onclick={() => onselect(agent)}>
          <Check class={['mt-0.5 size-4 shrink-0', agent.id !== current && 'invisible']} />
          <span class="flex min-w-0 flex-col items-start text-left">
            <span class="font-medium">{agent.name}</span>
            {#if agent.description}<span class="text-xs text-base-content/60"
                >{agent.description}</span
              >{/if}
          </span>
        </button>
      </li>
    {/each}
  </ul>
</Sheet>
