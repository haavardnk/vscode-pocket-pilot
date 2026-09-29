<script lang="ts">
  import type { FileContent } from '@pocket-pilot/protocol';

  import { baseName } from '../../code/paths';
  import CodeView from './CodeView.svelte';

  interface Props {
    content: FileContent;
    size: number;
    languageId: string | null;
    path: string;
    line?: number | null;
  }

  const { content, size, languageId, path, line = null }: Props = $props();

  const megabytes = $derived(`${(size / 1024 / 1024).toFixed(1)} MB`);
</script>

{#if content.kind === 'text'}
  <CodeView text={content.text} {languageId} {path} {line} />
{:else if content.kind === 'image'}
  <img
    class="mx-auto max-w-full p-4"
    src={`data:${content.mime};base64,${content.data}`}
    alt={baseName(path)}
  />
{:else if content.kind === 'binary'}
  <p class="p-10 text-center text-base-content/70">Binary file, {megabytes}.</p>
{:else if content.kind === 'tooLarge'}
  <p class="p-10 text-center text-base-content/70">
    This file is too large to show ({megabytes}).
  </p>
{:else}
  <p class="p-10 text-center text-base-content/70">This file no longer exists.</p>
{/if}
