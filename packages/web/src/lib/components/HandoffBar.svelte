<script lang="ts">
  import type { Agent, Handoff } from '@pocket-pilot/protocol';

  import { autopilotHandoff } from '../hub/handoffs';

  interface Props {
    agent: Agent;
    disabled: boolean;
    onselect: (handoff: Handoff, autopilot: boolean) => void;
  }

  const { agent, disabled, onselect }: Props = $props();

  const autopilot = $derived(autopilotHandoff(agent));
</script>

<section class="flex flex-col gap-1.5" aria-label={`Proceed from ${agent.name}`}>
  <p class="text-xs text-base-content/60">Proceed from {agent.name}</p>
  <div class="flex flex-wrap gap-2">
    {#each agent.handoffs as handoff (handoff.id)}
      <button
        class="btn btn-soft btn-primary btn-sm"
        {disabled}
        onclick={() => onselect(handoff, false)}
      >
        {handoff.label}
      </button>
      {#if handoff.id === autopilot?.id}
        <button class="btn btn-soft btn-sm" {disabled} onclick={() => onselect(handoff, true)}>
          Start with Autopilot
        </button>
      {/if}
    {/each}
  </div>
</section>
