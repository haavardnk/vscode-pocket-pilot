<script lang="ts">
  import type { AuthInfo, Connection, Device } from '@pocket-pilot/protocol';

  import { type Route, routeHash } from '../lib/routing';
  import BranchesScreen from './BranchesScreen.svelte';
  import ChatFileScreen from './ChatFileScreen.svelte';
  import FileScreen from './FileScreen.svelte';
  import FolderScreen from './FolderScreen.svelte';
  import GitDiffScreen from './GitDiffScreen.svelte';
  import HomeScreen from './HomeScreen.svelte';
  import NewSessionScreen from './NewSessionScreen.svelte';
  import OpenFolderScreen from './OpenFolderScreen.svelte';
  import SessionChangesScreen from './SessionChangesScreen.svelte';
  import SessionDiffScreen from './SessionDiffScreen.svelte';
  import SessionScreen from './SessionScreen.svelte';
  import TerminalScreen from './TerminalScreen.svelte';
  import WindowsScreen from './WindowsScreen.svelte';

  interface Props {
    route: Route;
    device: Device;
    connection: Connection;
    onsignedout: (info: AuthInfo) => void;
  }

  const { route, device, connection, onsignedout }: Props = $props();

  const hash = $derived(routeHash(route));
</script>

{#if route.name === 'session'}
  <SessionScreen windowId={route.windowId} sessionId={route.sessionId} />
{:else if route.name === 'new'}
  <NewSessionScreen />
{:else if route.name === 'windows'}
  <WindowsScreen />
{:else if route.name === 'open'}
  <OpenFolderScreen />
{:else if route.name === 'terminal'}
  {#key hash}
    <TerminalScreen
      windowId={route.windowId}
      terminalId={route.terminalId}
      executionId={route.executionId}
    />
  {/key}
{:else if route.name === 'folder'}
  {#key hash}
    <FolderScreen
      windowId={route.windowId}
      folderId={route.folderId}
      tab={route.tab}
      path={route.path}
    />
  {/key}
{:else if route.name === 'branches'}
  {#key hash}
    <BranchesScreen windowId={route.windowId} folderId={route.folderId} />
  {/key}
{:else if route.name === 'file'}
  {#key hash}
    <FileScreen windowId={route.windowId} folderId={route.folderId} path={route.path} />
  {/key}
{:else if route.name === 'gitDiff'}
  {#key hash}
    <GitDiffScreen windowId={route.windowId} folderId={route.folderId} path={route.path} />
  {/key}
{:else if route.name === 'sessionChanges'}
  {#key hash}
    <SessionChangesScreen
      windowId={route.windowId}
      sessionId={route.sessionId}
      requestId={route.requestId}
    />
  {/key}
{:else if route.name === 'sessionDiff'}
  {#key hash}
    <SessionDiffScreen
      windowId={route.windowId}
      sessionId={route.sessionId}
      path={route.path}
      requestId={route.requestId}
    />
  {/key}
{:else if route.name === 'editDiff'}
  {#key hash}
    <SessionDiffScreen
      windowId={route.windowId}
      sessionId={route.sessionId}
      path={route.path}
      requestId={route.requestId}
      edit={{ stopId: route.stopId, callId: route.callId }}
    />
  {/key}
{:else if route.name === 'chatFile'}
  {#key hash}
    <ChatFileScreen
      windowId={route.windowId}
      sessionId={route.sessionId}
      uri={route.uri}
      line={route.line}
    />
  {/key}
{:else}
  <HomeScreen tab={route.name} {device} {connection} {onsignedout} />
{/if}
