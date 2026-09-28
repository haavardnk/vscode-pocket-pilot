<script lang="ts">
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import CircleDot from '@lucide/svelte/icons/circle-dot';
  import CircleX from '@lucide/svelte/icons/circle-x';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import type { CheckState, PullRequest, ReviewState } from '@pocket-pilot/protocol';

  import { ALL_REPOSITORIES, pullRequestsFor } from '../hub/views';
  import { clock } from '../stores/clock.svelte';
  import { hub } from '../stores/hub.svelte';
  import { ago } from '../time';
  import Loading from './Loading.svelte';

  const state = $derived(hub.pullRequests);
  const items = $derived(pullRequestsFor(state, hub.repository));
  const errors = $derived(
    state.errors.filter(
      (error) => hub.repository === ALL_REPOSITORIES || error.repositoryKey === hub.repository
    )
  );
  const repositoryLabels = $derived(new Map(hub.groups.map((group) => [group.key, group.label])));

  const checkLabels: Record<CheckState, string> = {
    success: 'Checks passed',
    failure: 'Checks failed',
    pending: 'Checks running',
    none: 'No checks'
  };

  const reviewLabels: Record<ReviewState, string | null> = {
    approved: 'Approved',
    changesRequested: 'Changes requested',
    reviewRequired: 'Review required',
    none: null
  };

  function reviewClass(review: ReviewState): string {
    if (review === 'approved') return 'badge-success';
    if (review === 'changesRequested') return 'badge-error';
    return 'badge-ghost';
  }

  function showRepository(pullRequest: PullRequest): string | null {
    return hub.repository === ALL_REPOSITORIES
      ? (repositoryLabels.get(pullRequest.repositoryKey) ?? null)
      : null;
  }
</script>

<div class="flex items-center justify-between px-4 py-2 text-sm">
  <span class="text-base-content/60">
    {#if state.status === 'ready' && state.fetchedAt}Updated {ago(state.fetchedAt, clock.now)}{/if}
  </span>
  {#if state.status === 'ready' || state.status === 'loading'}
    <button
      class="btn btn-square btn-ghost btn-sm"
      aria-label="Refresh pull requests"
      disabled={state.status === 'loading'}
      onclick={() => hub.refreshPullRequests()}
    >
      <RefreshCw class={['size-4', state.status === 'loading' && 'animate-spin']} />
    </button>
  {/if}
</div>

{#if state.status === 'disabled'}
  <p class="p-10 text-center text-base-content/70">
    Pull requests are turned off in the VS Code settings.
  </p>
{:else if state.status === 'signedOut'}
  <p class="p-10 text-center text-base-content/70">
    Run "Pocket Pilot: Sign In to GitHub" in VS Code to see pull requests.
  </p>
{:else if state.status === 'loading' && items.length === 0}
  <Loading />
{:else}
  {#each errors as error (error.repositoryKey)}
    <div role="alert" class="mx-4 mb-2 alert alert-soft text-sm alert-warning">{error.message}</div>
  {/each}
  {#if items.length === 0}
    <p class="p-10 text-center text-base-content/70">No open pull requests.</p>
  {:else}
    <ul class="list">
      {#each items as pullRequest (`${pullRequest.repositoryKey}#${pullRequest.number}`)}
        <li>
          <a
            class="list-row items-start active:bg-base-200"
            href={pullRequest.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span class="pt-0.5" title={checkLabels[pullRequest.checks]}>
              {#if pullRequest.checks === 'success'}
                <CircleCheck class="size-5 text-success" aria-label={checkLabels.success} />
              {:else if pullRequest.checks === 'failure'}
                <CircleX class="size-5 text-error" aria-label={checkLabels.failure} />
              {:else if pullRequest.checks === 'pending'}
                <CircleDot class="size-5 text-warning" aria-label={checkLabels.pending} />
              {:else}
                <CircleDot class="size-5 text-base-content/40" aria-label={checkLabels.none} />
              {/if}
            </span>
            <div class="min-w-0 list-col-grow">
              <p class="font-medium">{pullRequest.title}</p>
              <p class="truncate text-xs text-base-content/60">
                #{pullRequest.number}
                {#if showRepository(pullRequest)}· {showRepository(pullRequest)}{/if}
                {#if pullRequest.author}· {pullRequest.author}{/if}
                · {ago(Date.parse(pullRequest.updatedAt), clock.now)}
              </p>
              <div class="mt-1 flex flex-wrap items-center gap-1">
                {#if pullRequest.isDraft}<span class="badge badge-ghost badge-sm">Draft</span>{/if}
                {#if reviewLabels[pullRequest.review]}
                  <span class={['badge badge-sm', reviewClass(pullRequest.review)]}
                    >{reviewLabels[pullRequest.review]}</span
                  >
                {/if}
                {#if pullRequest.mergeable === 'conflicting'}
                  <span class="badge badge-outline badge-sm badge-error">Conflicts</span>
                {/if}
                <span class="text-xs">
                  <span class="text-success">+{pullRequest.additions}</span>
                  <span class="text-error">−{pullRequest.deletions}</span>
                </span>
              </div>
            </div>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
{/if}
