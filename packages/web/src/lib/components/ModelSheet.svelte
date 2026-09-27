<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import type { ConfigValue, Model, ModelConfigOption } from '@pocket-pilot/protocol';

  import { findModel } from '../hub/views';
  import Sheet from './Sheet.svelte';

  interface Props {
    open: boolean;
    models: Model[];
    current: string | null;
    onselect: (model: Model) => void;
    onconfig: (model: Model, option: ModelConfigOption, value: ConfigValue | null) => void;
    onclose: () => void;
  }

  const { open, models, current, onselect, onconfig, onclose }: Props = $props();

  const selected = $derived(findModel(models, current));

  function selectValue(option: ModelConfigOption): string {
    return String(option.value ?? option.defaultValue ?? '');
  }

  function change(model: Model, option: ModelConfigOption, raw: string): void {
    const choice = option.choices.find((candidate) => String(candidate.value) === raw);
    onconfig(model, option, choice?.value ?? null);
  }
</script>

<Sheet {open} title="Model" {onclose}>
  {#if selected && selected.options.length > 0}
    <div class="mb-3 flex flex-col gap-2">
      {#each selected.options as option (option.key)}
        <label class="flex items-center justify-between gap-3 text-sm">
          <span>{option.title}</span>
          <select
            class="select w-auto select-sm"
            value={selectValue(option)}
            onchange={(event) => change(selected, option, event.currentTarget.value)}
          >
            {#each option.choices as choice (choice.value)}
              <option value={String(choice.value)}>{choice.label}</option>
            {/each}
          </select>
        </label>
      {/each}
      <p class="text-xs text-base-content/60">
        Settings apply to every chat that uses {selected.name}.
      </p>
    </div>
  {/if}
  <ul class="menu w-full p-0">
    {#each models as model (model.id)}
      <li>
        <button class="flex items-center gap-3 py-3" onclick={() => onselect(model)}>
          <Check class={['size-4 shrink-0', model.id !== selected?.id && 'invisible']} />
          <span class="flex-1 text-left">{model.name}</span>
          {#if model.vendor !== 'copilot'}<span class="text-xs text-base-content/50"
              >{model.vendor}</span
            >{/if}
        </button>
      </li>
    {/each}
  </ul>
</Sheet>
