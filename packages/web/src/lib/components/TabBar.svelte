<script lang="ts">
  import CodeXml from '@lucide/svelte/icons/code-xml';
  import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
  import MessagesSquare from '@lucide/svelte/icons/messages-square';
  import Settings from '@lucide/svelte/icons/settings';
  import SquareTerminal from '@lucide/svelte/icons/square-terminal';

  import type { Tab } from '../routing';
  import { router } from '../stores/router.svelte';

  const tabs: { name: Tab; label: string; icon: typeof Settings }[] = [
    { name: 'chats', label: 'Chats', icon: MessagesSquare },
    { name: 'terminals', label: 'Terminals', icon: SquareTerminal },
    { name: 'code', label: 'Code', icon: CodeXml },
    { name: 'pullRequests', label: 'Pull requests', icon: GitPullRequest },
    { name: 'settings', label: 'Settings', icon: Settings }
  ];

  function open(tab: Tab): void {
    if (router.route.name === tab) {
      document.querySelector(`[data-tab="${tab}"]`)?.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      router.openTab(tab);
    }
  }
</script>

<nav class="tab-bar dock z-30 dock-md bg-base-200">
  {#each tabs as item (item.name)}
    <button
      class={[item.name === router.tab && 'dock-active text-primary']}
      aria-current={item.name === router.tab ? 'page' : undefined}
      onclick={() => open(item.name)}
    >
      <item.icon class="size-5" />
      <span class="dock-label">{item.label}</span>
    </button>
  {/each}
</nav>
