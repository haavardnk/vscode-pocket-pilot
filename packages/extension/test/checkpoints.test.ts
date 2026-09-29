import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { SessionDetail } from '@pocket-pilot/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Checkpoints, disabledRequests } from '../src/sessions/checkpoints';
import { EditingSessions } from '../src/sessions/editingState';
import { parseTimeline } from '../src/sessions/timeline';

const operation = (requestId: string, epoch: number): unknown => ({
  type: 'textEdit',
  uri: { scheme: 'file', fsPath: '/a.ts' },
  requestId,
  epoch,
  edits: []
});

const state = (currentEpoch: number | undefined): unknown => ({
  timeline: {
    checkpoints: [
      { checkpointId: 'k0', epoch: 0, label: 'Initial State' },
      { checkpointId: 'k1', requestId: 'r1', epoch: 1, label: '' },
      { checkpointId: 'k2', requestId: 'r1', undoStopId: 'u1', epoch: 3, label: '' },
      { checkpointId: 'k3', requestId: 'r2', epoch: 4, label: '' },
      { checkpointId: 'k4', requestId: 'r2', undoStopId: 'u2', epoch: 6, label: '' },
      { checkpointId: 'k5', requestId: 'r3', epoch: 7, label: '' }
    ],
    currentEpoch,
    operations: [operation('r1', 2), operation('r2', 5), operation('r3', 8)],
    fileBaselines: []
  }
});

const detail = (ids: string[]): SessionDetail => ({
  id: 's1',
  title: 'Session',
  status: 'idle',
  modelId: null,
  modeId: null,
  permission: 'default',
  totalRequests: ids.length,
  editedFiles: 0,
  todos: null,
  requests: ids.map((id, index) => ({
    id,
    timestamp: index,
    message: id,
    modelId: null,
    agentName: null,
    state: 'complete',
    error: null,
    editable: true,
    disabled: false,
    editedPaths: [],
    parts: []
  })),
  queued: []
});

describe('disabledRequests', () => {
  it.each([
    ['nothing is undone', 9, []],
    ['a later request is restored', 4, ['r2', 'r3']],
    ['the first request is restored', 1, ['r1', 'r2', 'r3']],
    ['an undo stop is restored', 6, ['r3']],
    ['the epoch is unknown', undefined, []]
  ])('disables whole requests when %s', (_, currentEpoch, expected) => {
    expect(disabledRequests(parseTimeline(state(currentEpoch)))).toEqual(expected);
  });
});

describe('Checkpoints', () => {
  let root: string;
  let file: string;
  let checkpoints: Checkpoints;

  const save = async (currentEpoch: number, at: number): Promise<void> => {
    await writeFile(file, JSON.stringify(state(currentEpoch)));
    await utimes(file, at / 1000, at / 1000);
  };

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'checkpoints-'));
    await mkdir(join(root, 's1'));
    file = join(root, 's1', 'state.json');
    checkpoints = new Checkpoints(root, new EditingSessions(root), () => undefined);
  });

  afterEach(async () => {
    checkpoints.dispose();
    await rm(root, { recursive: true, force: true });
  });

  it('shows a phone restore until VS Code saves the editing state', async () => {
    const disabled = async (): Promise<boolean[]> =>
      (await checkpoints.decorate(detail(['r1', 'r2', 'r3']))).requests.map(
        (request) => request.disabled
      );
    await save(9, Date.now() - 60_000);
    expect(await disabled()).toEqual([false, false, false]);

    checkpoints.expect('s1', ['r2', 'r3']);
    expect(await disabled()).toEqual([false, true, true]);

    await save(9, Date.now() - 1000);
    expect(await disabled()).toEqual([false, true, true]);

    await save(1, Date.now() + 1000);
    expect(await disabled()).toEqual([true, true, true]);
  });

  it('lists files from the editing timeline and edit parts', async () => {
    await save(9, Date.now());
    const base = detail(['r1', 'r2', 'r4']);
    const logged = {
      ...base,
      requests: base.requests.map((request) =>
        request.id === 'r1' || request.id === 'r4'
          ? {
              ...request,
              parts: [
                {
                  kind: 'edit' as const,
                  path: request.id === 'r1' ? '/a.ts' : '/b.ts',
                  stopId: null,
                  callId: null,
                  additions: 1,
                  deletions: 0
                }
              ]
            }
          : request
      )
    };
    const decorated = await checkpoints.decorate(logged);
    expect(decorated.requests.map((request) => request.editedPaths)).toEqual([
      ['/a.ts'],
      ['/a.ts'],
      ['/b.ts']
    ]);
  });
});
