<script lang="ts">
  import { branchNameError } from '@pocket-pilot/protocol';

  import Sheet from '../Sheet.svelte';

  interface Props {
    open: boolean;
    from: string | null;
    busy: boolean;
    oncreate: (name: string) => void;
    onclose: () => void;
  }

  const { open, from, busy, oncreate, onclose }: Props = $props();

  let name = $state('');

  const error = $derived(name ? branchNameError(name) : null);

  function close(): void {
    name = '';
    onclose();
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    if (!name || error || busy) return;
    oncreate(name);
  }
</script>

<Sheet {open} title="New branch" onclose={close}>
  <form class="flex flex-col gap-3" onsubmit={submit}>
    <label class="flex flex-col gap-1">
      <span class="text-sm text-base-content/70">
        {from ? `Starts from ${from}.` : 'Starts from the current commit.'} Uncommitted changes come along.
      </span>
      <input
        class={['input w-full font-mono', error && 'input-error']}
        placeholder="feature/name"
        aria-label="Branch name"
        aria-invalid={error !== null}
        aria-describedby="new-branch-error"
        autocapitalize="off"
        autocomplete="off"
        spellcheck="false"
        bind:value={name}
      />
      <span id="new-branch-error" class="min-h-4 text-xs text-error">{error ?? ''}</span>
    </label>
    <button class="btn btn-block btn-primary" disabled={!name || error !== null || busy}>
      {#if busy}<span class="loading loading-sm loading-spinner"></span>{/if}
      Create and switch
    </button>
    <button type="button" class="btn btn-block btn-ghost" onclick={close}>Cancel</button>
  </form>
</Sheet>
