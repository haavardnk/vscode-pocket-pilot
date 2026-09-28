<script lang="ts">
  import FilePen from '@lucide/svelte/icons/file-pen';
  import type { ResponsePart } from '@pocket-pilot/protocol';

  import { baseName } from '../code/paths';
  import { routeHash } from '../routing';
  import DiffStat from './code/DiffStat.svelte';

  interface Props {
    part: Extract<ResponsePart, { kind: 'edit' }>;
    windowId: string;
    sessionId: string;
    requestId: string;
  }

  const { part, windowId, sessionId, requestId }: Props = $props();
</script>

<a
  class="flex max-w-full items-center gap-2 self-start text-sm text-base-content/70 hover:text-primary"
  href={routeHash({
    name: 'editDiff',
    windowId,
    sessionId,
    requestId,
    path: part.path,
    stopId: part.stopId,
    callId: part.callId
  })}
>
  <FilePen class="size-4 shrink-0" />
  <span class="truncate font-mono underline decoration-base-content/30">{baseName(part.path)}</span>
  <DiffStat additions={part.additions} deletions={part.deletions} />
</a>
