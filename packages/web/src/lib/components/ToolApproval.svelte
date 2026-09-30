<script lang="ts">
  import type { PendingTool } from '../hub/views';
  import { hub } from '../stores/hub.svelte';
  import { toasts } from '../stores/toasts.svelte';
  import CopyButton from './CopyButton.svelte';

  interface Props {
    windowId: string;
    sessionId: string;
    tool: PendingTool;
    disabled: boolean;
  }

  const { windowId, sessionId, tool, disabled }: Props = $props();

  let deciding = $state(false);

  async function decide(decision: 'accept' | 'skip'): Promise<void> {
    deciding = true;
    try {
      await hub.command({ kind: 'toolDecision', windowId, sessionId, decision });
    } catch (error) {
      toasts.error(error);
    }
    deciding = false;
  }
</script>

<div role="alert" class="alert flex flex-col items-stretch gap-2 alert-soft alert-warning">
  <p class="text-sm">
    <span class="font-medium">Allow tool?</span>
    {tool.message || tool.toolId}
  </p>
  {#if tool.detail}
    <div class="relative">
      <pre
        class="max-h-32 overflow-auto rounded-field bg-base-100/60 py-1 pr-8 pl-2 text-xs whitespace-pre-wrap"><code
          >{tool.detail}</code
        ></pre>
      <CopyButton class="absolute top-0.5 right-0.5" text={tool.detail} label="Copy details" />
    </div>
  {/if}
  <div class="flex gap-2">
    <button
      class="btn flex-1 btn-primary btn-sm"
      disabled={deciding || disabled}
      onclick={() => void decide('accept')}
    >
      Allow
    </button>
    <button
      class="btn flex-1 btn-sm"
      disabled={deciding || disabled}
      onclick={() => void decide('skip')}
    >
      Skip
    </button>
  </div>
</div>
