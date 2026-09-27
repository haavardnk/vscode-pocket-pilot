<script lang="ts">
  import TextWrap from '@lucide/svelte/icons/text-wrap';

  import { codeView } from '../../stores/codeView.svelte';
</script>

<button
  class={['btn btn-square btn-ghost', codeView.wrap && 'text-primary']}
  aria-label="Wrap lines"
  aria-pressed={codeView.wrap}
  onclick={() => codeView.toggleWrap()}
>
  <TextWrap class="size-5" />
</button>
