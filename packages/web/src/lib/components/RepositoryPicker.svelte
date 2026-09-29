<script lang="ts">
  import { ALL_REPOSITORIES } from '../hub/views';
  import { hub } from '../stores/hub.svelte';
  import { router } from '../stores/router.svelte';

  const OPEN_FOLDER = 'open-folder';

  function select(select: HTMLSelectElement): void {
    if (select.value !== OPEN_FOLDER) {
      hub.selectRepository(select.value);
      return;
    }
    select.value = hub.repository;
    router.go({ name: 'open' });
  }
</script>

<select
  class="select min-w-0 flex-1 select-ghost text-lg font-semibold"
  value={hub.repository}
  onchange={(event) => select(event.currentTarget)}
  aria-label="Repository"
>
  <option value={ALL_REPOSITORIES}>All repositories</option>
  {#each hub.groups as group (group.key)}
    <option value={group.key}
      >{group.label}{group.running > 0 ? ` (${group.running} active)` : ''}</option
    >
  {/each}
  {#if hub.windows.length > 0}
    <option value={OPEN_FOLDER}>Open another folder…</option>
  {/if}
</select>
