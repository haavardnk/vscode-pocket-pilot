<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import type { PermissionLevel } from '@pocket-pilot/protocol';

  import { type PermissionOption, PERMISSIONS } from '../hub/permissions';
  import Sheet from './Sheet.svelte';

  interface Props {
    open: boolean;
    current: PermissionLevel;
    onselect: (level: PermissionLevel) => void;
    onclose: () => void;
  }

  const { open, current, onselect, onclose }: Props = $props();

  let confirming = $state<PermissionOption | null>(null);

  function pick(option: PermissionOption): void {
    if (option.warning && option.level !== current) {
      confirming = option;
      return;
    }
    onselect(option.level);
  }

  function close(): void {
    confirming = null;
    onclose();
  }
</script>

<Sheet {open} title="Approvals" onclose={close}>
  {#if confirming}
    <div role="alert" class="alert flex flex-col items-stretch gap-3 alert-soft alert-warning">
      <p class="flex items-center gap-2 font-medium">
        <TriangleAlert class="size-4 shrink-0" />Turn on {confirming.label}?
      </p>
      <p class="text-sm">{confirming.warning}</p>
      <div class="flex gap-2">
        <button
          class="btn flex-1 btn-sm btn-warning"
          onclick={() => {
            if (confirming) onselect(confirming.level);
            confirming = null;
          }}
        >
          Turn on
        </button>
        <button class="btn flex-1 btn-sm" onclick={() => (confirming = null)}>Cancel</button>
      </div>
    </div>
  {:else}
    <ul class="menu w-full p-0">
      {#each Object.values(PERMISSIONS) as option (option.level)}
        <li>
          <button class="flex items-start gap-3 py-3" onclick={() => pick(option)}>
            <Check class={['mt-0.5 size-4 shrink-0', option.level !== current && 'invisible']} />
            <span class="flex min-w-0 flex-col items-start text-left">
              <span class="font-medium">{option.label}</span>
              <span class="text-xs text-base-content/60">{option.description}</span>
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</Sheet>
