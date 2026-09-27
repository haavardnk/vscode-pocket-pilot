<script lang="ts">
  import type { Connection, PushEvent } from '@pocket-pilot/protocol';
  import { onMount } from 'svelte';

  import { notifications } from '../stores/notifications.svelte';
  import { toasts } from '../stores/toasts.svelte';

  interface Props {
    connection: Connection;
  }

  const { connection }: Props = $props();

  const EVENTS: { id: PushEvent; label: string }[] = [
    { id: 'finished', label: 'Agent finished' },
    { id: 'needsInput', label: 'Agent needs input' },
    { id: 'failed', label: 'Request failed' }
  ];

  onMount(() => {
    notifications.load().catch((error: unknown) => toasts.error(error));
  });

  async function attempt(task: () => Promise<void>, done?: string): Promise<void> {
    try {
      await task();
      if (done) toasts.show(done);
    } catch (error) {
      toasts.error(error);
    }
  }

  async function toggle(input: HTMLInputElement): Promise<void> {
    await attempt(() => (input.checked ? notifications.enable() : notifications.disable()));
    input.checked = notifications.events !== null;
  }
</script>

<section class="flex flex-col gap-2">
  <h2 class="text-sm font-medium text-base-content/60">Notifications</h2>
  <div class="flex flex-col gap-3 rounded-box bg-base-200 p-4 text-sm">
    {#if !notifications.supported}
      <p>
        This browser cannot receive notifications. On iPhone and iPad, add Pocket Pilot to the Home
        Screen and open it from there.
      </p>
    {:else}
      <label class="flex items-center justify-between gap-3">
        <span class="font-medium">Notify this device</span>
        <input
          type="checkbox"
          class="toggle toggle-primary"
          checked={notifications.events !== null}
          disabled={notifications.busy ||
            !notifications.loaded ||
            notifications.permission === 'denied'}
          onchange={(event) => void toggle(event.currentTarget)}
        />
      </label>
      {#if notifications.permission === 'denied'}
        <p>Notifications are blocked for this site. Allow them in the browser settings.</p>
      {/if}
      {#if notifications.events}
        {@const events = notifications.events}
        {#each EVENTS as item (item.id)}
          <label class="flex items-center gap-3">
            <input
              type="checkbox"
              class="checkbox checkbox-sm"
              checked={events[item.id]}
              disabled={notifications.busy}
              onchange={(event) =>
                void attempt(() => notifications.setEvent(item.id, event.currentTarget.checked))}
            />
            {item.label}
          </label>
        {/each}
        <button
          class="btn self-start btn-sm"
          disabled={notifications.busy}
          onclick={() => void attempt(() => notifications.test(), 'Test notification sent')}
        >
          Send test notification
        </button>
      {/if}
      <p class="text-base-content/60">
        Sent while Pocket Pilot is closed or in the background.
        {#if connection === 'quickTunnel'}
          Tapping a notification only works while this temporary address stays the same.
        {/if}
      </p>
    {/if}
  </div>
</section>
