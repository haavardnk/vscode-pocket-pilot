import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it, vi } from 'vitest';

import { watchTargets } from '../src/fsWatch';

it('reports a watcher live once it settles, never after close', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'watch-'));
  const ignore = (): void => undefined;
  const closedLive = vi.fn();
  const closed = watchTargets([{ path: folder, depth: 0 }], ignore, ignore, closedLive);
  await new Promise<void>((resolve) => closed.once('ready', () => resolve()));
  await closed.close();
  const openLive = vi.fn();
  const open = watchTargets([{ path: folder, depth: 0 }], ignore, ignore, openLive);
  await vi.waitFor(() => expect(openLive).toHaveBeenCalledOnce(), { timeout: 5000 });
  expect(closedLive).not.toHaveBeenCalled();
  await open.close();
  await rm(folder, { recursive: true, force: true });
});
