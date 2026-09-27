<script lang="ts">
  import { ALL_REPOSITORIES } from '../hub/views';
  import { hub } from '../stores/hub.svelte';
</script>

<select
  class="select min-w-0 flex-1 select-ghost text-lg font-semibold"
  value={hub.repository}
  onchange={(event) => hub.selectRepository(event.currentTarget.value)}
  aria-label="Repository"
>
  <option value={ALL_REPOSITORIES}>All repositories</option>
  {#each hub.groups as group (group.key)}
    <option value={group.key}
      >{group.label}{group.running > 0 ? ` (${group.running} active)` : ''}</option
    >
  {/each}
</select>
