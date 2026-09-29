<script lang="ts">
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import Gauge from '@lucide/svelte/icons/gauge';
  import InfinityIcon from '@lucide/svelte/icons/infinity';
  import KeyRound from '@lucide/svelte/icons/key-round';
  import Sparkles from '@lucide/svelte/icons/sparkles';

  import { hub } from '../stores/hub.svelte';
  import {
    countLabel,
    METER_LABELS,
    percentLabel,
    progressClass,
    usageCaption,
    visibleMeters
  } from '../usage';
  import SettingsGroup from './SettingsGroup.svelte';

  const usage = $derived(hub.usage);
  const meters = $derived(visibleMeters(usage));
</script>

{#if usage}
  <SettingsGroup title="Copilot">
    {#snippet caption()}
      {#if usage.state === 'ready'}
        {usageCaption(usage, Date.now())}
      {:else if usage.state === 'needsAccess'}
        To show your Copilot usage, allow Pocket Pilot to use your GitHub account from the Accounts
        menu in VS Code.
      {:else}
        {usage.reason}.
      {/if}
    {/snippet}
    {#if usage.state === 'ready'}
      <li class="list-row items-center py-3">
        <Sparkles class="size-5 text-base-content/70" />
        <span class="list-col-grow">Plan</span>
        <span class="text-base-content/70">{usage.plan ?? 'Copilot'}</span>
      </li>
      {#each meters as meter (meter.kind)}
        {@const count = countLabel(meter)}
        <li class="list-row items-center py-3">
          <Gauge class="size-5 text-base-content/70" />
          <div class="flex min-w-0 flex-col gap-2 list-col-grow">
            <div class="flex items-baseline justify-between gap-2">
              <span>{METER_LABELS[meter.kind]}</span>
              <span class="text-sm text-base-content/70">{percentLabel(meter)}</span>
            </div>
            <progress
              class={progressClass(meter)}
              value={meter.usedPercent}
              max="100"
              aria-label={METER_LABELS[meter.kind]}
            ></progress>
            {#if count}<span class="text-xs text-base-content/60">{count}</span>{/if}
          </div>
        </li>
      {:else}
        <li class="list-row items-center py-3">
          <InfinityIcon class="size-5 text-base-content/70" />
          <span class="list-col-grow">Usage</span>
          <span class="text-base-content/70">Unlimited</span>
        </li>
      {/each}
    {:else if usage.state === 'needsAccess'}
      <li class="list-row items-center py-3">
        <KeyRound class="size-5 text-base-content/70" />
        <span class="list-col-grow">GitHub account</span>
        <span class="text-base-content/70">Not allowed yet</span>
      </li>
    {:else}
      <li class="list-row items-center py-3">
        <CircleAlert class="size-5 text-base-content/70" />
        <span class="list-col-grow">Usage</span>
        <span class="text-base-content/70">Not available</span>
      </li>
    {/if}
  </SettingsGroup>
{/if}
