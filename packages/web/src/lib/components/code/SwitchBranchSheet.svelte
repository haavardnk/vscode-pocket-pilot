<script lang="ts">
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

  import Sheet from '../Sheet.svelte';

  interface Props {
    open: boolean;
    branch: string;
    changed: number;
    active: number;
    onswitch: (stash: boolean) => void;
    onclose: () => void;
  }

  const { open, branch, changed, active, onswitch, onclose }: Props = $props();
</script>

<Sheet {open} title={`Switch to ${branch}?`} {onclose}>
  <div class="flex flex-col gap-3">
    {#if active > 0}
      <p role="alert" class="flex gap-2 text-sm text-warning">
        <TriangleAlert class="size-4 shrink-0 translate-y-0.5" />
        <span>
          {active}
          {active === 1 ? 'chat is' : 'chats are'} still active in this window. Switching branches changes
          the files under {active === 1 ? 'it' : 'them'}.
        </span>
      </p>
    {/if}
    {#if changed > 0}
      <p class="text-sm text-base-content/70">
        {changed}
        {changed === 1 ? 'file has' : 'files have'} uncommitted changes. Bring them along, or put them
        in the Git stash and switch to a clean {branch}.
      </p>
      <button class="btn btn-block btn-primary" onclick={() => onswitch(false)}>
        Bring changes along
      </button>
      <button class="btn btn-block" onclick={() => onswitch(true)}>Stash and switch</button>
    {:else}
      <button class="btn btn-block btn-primary" onclick={() => onswitch(false)}>
        Switch branch
      </button>
    {/if}
    <button class="btn btn-block btn-ghost" onclick={onclose}>Cancel</button>
  </div>
</Sheet>
