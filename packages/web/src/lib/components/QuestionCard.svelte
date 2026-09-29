<script lang="ts">
  import CircleHelp from '@lucide/svelte/icons/circle-help';
  import type {
    OptionValue,
    Question,
    QuestionAnswers,
    ResponsePart
  } from '@pocket-pilot/protocol';

  import { getChatContext } from '../chatContext';
  import { answerSummary, collectAnswers, type Draft, initialDraft } from '../hub/questions';
  import { markdown } from '../markdown';

  interface Props {
    part: Extract<ResponsePart, { kind: 'questions' }>;
    disabled: boolean;
    onanswer: (resolveId: string, answers: QuestionAnswers | null) => Promise<boolean>;
  }

  const { part, disabled, onanswer }: Props = $props();

  const chat = getChatContext();

  let edits = $state<Record<string, Draft>>({});
  let sending = $state(false);

  const draftFor = (question: Question): Draft => edits[question.id] ?? initialDraft(question);
  const pending = $derived(part.state === 'pending' && part.resolveId !== null);
  const collected = $derived(collectAnswers(part.questions, draftFor));

  function edit(question: Question, change: Partial<Draft>): void {
    edits[question.id] = { ...draftFor(question), ...change };
  }

  function choose(question: Question, value: OptionValue, checked: boolean): void {
    if (question.type === 'singleSelect') {
      edit(question, { selected: [value], freeform: '' });
      return;
    }
    const selected = draftFor(question).selected.filter((item) => item !== value);
    edit(question, { selected: checked ? [...selected, value] : selected });
  }

  function type(question: Question, freeform: string): void {
    const exclusive = question.type === 'singleSelect' && freeform.trim() !== '';
    edit(question, exclusive ? { freeform, selected: [] } : { freeform });
  }

  async function submit(answers: QuestionAnswers | null): Promise<void> {
    if (!part.resolveId) return;
    sending = true;
    await onanswer(part.resolveId, answers);
    sending = false;
  }
</script>

<section
  class="card border border-base-300 bg-base-200 text-sm"
  aria-label="Questions from the agent"
>
  <div class="card-body gap-4 p-4">
    <p class="flex items-center gap-2 font-medium">
      <CircleHelp class="size-4 shrink-0 text-warning" />
      {pending ? 'The agent is asking' : 'The agent asked'}
    </p>
    {#each part.questions as question (question.id)}
      {@const draft = draftFor(question)}
      <fieldset class="fieldset gap-1.5 p-0">
        <legend class="fieldset-legend pb-0 text-sm">
          {question.title}{#if question.required && pending}<span class="text-error">*</span>{/if}
        </legend>
        {#if question.message}
          <div
            class="markdown text-base-content/70"
            {@attach markdown(question.message, chat)}
          ></div>
        {/if}
        {#if !pending}
          {#if part.answers}<p>{answerSummary(question, part.answers[question.id])}</p>{/if}
        {:else if question.type === 'text'}
          <textarea
            class="textarea field-sizing-content min-h-16 w-full text-base"
            aria-label={question.title}
            value={draft.freeform}
            oninput={(event) => type(question, event.currentTarget.value)}></textarea>
        {:else}
          {#each question.options as option (option.id)}
            <label class="flex cursor-pointer items-start gap-3 py-1">
              <input
                type={question.type === 'singleSelect' ? 'radio' : 'checkbox'}
                class={question.type === 'singleSelect'
                  ? 'radio mt-0.5 radio-sm radio-primary'
                  : 'checkbox mt-0.5 checkbox-sm checkbox-primary'}
                name={`${part.resolveId}-${question.id}`}
                checked={draft.selected.includes(option.value)}
                onchange={(event) => choose(question, option.value, event.currentTarget.checked)}
              />
              <span>{option.label}</span>
            </label>
          {/each}
          {#if question.allowFreeformInput}
            <input
              class="input w-full text-base input-sm"
              placeholder="Other answer"
              aria-label={`${question.title}: other answer`}
              value={draft.freeform}
              oninput={(event) => type(question, event.currentTarget.value)}
            />
          {/if}
        {/if}
      </fieldset>
    {/each}
    {#if pending}
      <div class="flex gap-2">
        <button
          class="btn flex-1 btn-primary btn-sm"
          disabled={disabled || sending || !collected.complete}
          onclick={() => void submit(collected.answers)}
        >
          Submit answers
        </button>
        {#if part.allowSkip}
          <button
            class="btn flex-1 btn-sm"
            disabled={disabled || sending}
            onclick={() => void submit(null)}
          >
            Skip
          </button>
        {/if}
      </div>
    {:else if part.state === 'expired'}
      <p class="text-base-content/60">No longer waiting for an answer.</p>
    {:else if !part.answers}
      <p class="text-base-content/60">Skipped</p>
    {/if}
  </div>
</section>
