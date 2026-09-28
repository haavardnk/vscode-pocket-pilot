<script lang="ts">
  import Bell from '@lucide/svelte/icons/bell';
  import BellOff from '@lucide/svelte/icons/bell-off';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import CircleX from '@lucide/svelte/icons/circle-x';
  import MessageCircleQuestionMark from '@lucide/svelte/icons/message-circle-question-mark';
  import Send from '@lucide/svelte/icons/send';
  import type { Connection, PushEvent } from '@pocket-pilot/protocol';
  import { onMount } from 'svelte';

  import { notifications } from '../stores/notifications.svelte';
  import { toasts } from '../stores/toasts.svelte';
  import SettingsGroup from './SettingsGroup.svelte';

  interface Props {
    connection: Connection;
  }

  const { connection }: Props = $props();

  const EVENTS: { id: PushEvent; label: string; icon: typeof Bell }[] = [
    { id: 'finished', label: 'Agent finished', icon: CircleCheck },
    { id: 'needsInput', label: 'Agent needs input', icon: MessageCircleQuestionMark },
    { id: 'failed', label: 'Request failed', icon: CircleX }
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

<SettingsGroup title="Notifications">
  {#snippet caption()}
    {#if !notifications.supported}
      On iPhone and iPad, add Pocket Pilot to the Home Screen and open it from there.
    {:else if notifications.permission === 'denied'}
      Notifications are blocked for this site. Allow them in the browser settings.
    {:else}
      Sent while Pocket Pilot is closed or in the background.
      {#if connection === 'quickTunnel'}
        Tapping a notification only works while this temporary address stays the same.
      {/if}
    {/if}
  {/snippet}
  {#if !notifications.supported}
    <li class="list-row items-center py-3">
      <BellOff class="size-5 text-base-content/70" />
      <span class="list-col-grow">This browser cannot receive notifications.</span>
    </li>
  {:else}
    <li>
      <label class="list-row items-center py-3">
        <Bell class="size-5 text-base-content/70" />
        <span class="list-col-grow">Notify this device</span>
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
    </li>
    {#if notifications.events}
      {@const events = notifications.events}
      {#each EVENTS as item (item.id)}
        <li>
          <label class="list-row items-center py-3">
            <item.icon class="size-5 text-base-content/70" />
            <span class="list-col-grow">{item.label}</span>
            <input
              type="checkbox"
              class="toggle toggle-primary toggle-sm"
              checked={events[item.id]}
              disabled={notifications.busy}
              onchange={(event) =>
                void attempt(() => notifications.setEvent(item.id, event.currentTarget.checked))}
            />
          </label>
        </li>
      {/each}
      <li>
        <button
          class="list-row w-full items-center py-3 text-left text-primary active:bg-base-300 disabled:opacity-50"
          disabled={notifications.busy}
          onclick={() => void attempt(() => notifications.test(), 'Test notification sent')}
        >
          <Send class="size-5" />
          <span class="list-col-grow">Send test notification</span>
        </button>
      </li>
    {/if}
  {/if}
</SettingsGroup>
