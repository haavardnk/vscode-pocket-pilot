<script lang="ts">
  import type { FileChange } from '@pocket-pilot/protocol';

  const { change }: { change: FileChange } = $props();

  const badges: Record<FileChange, { letter: string; label: string; tone: string }> = {
    modified: { letter: 'M', label: 'Modified', tone: 'text-warning' },
    added: { letter: 'A', label: 'Added', tone: 'text-success' },
    untracked: { letter: 'U', label: 'Untracked', tone: 'text-success' },
    deleted: { letter: 'D', label: 'Deleted', tone: 'text-error' },
    renamed: { letter: 'R', label: 'Renamed', tone: 'text-info' },
    conflicted: { letter: '!', label: 'Conflicted', tone: 'text-error' }
  };

  const badge = $derived(badges[change]);
</script>

<span
  class={['w-4 shrink-0 text-center font-mono text-xs font-bold', badge.tone]}
  title={badge.label}
>
  <span aria-hidden="true">{badge.letter}</span><span class="sr-only">{badge.label}</span>
</span>
