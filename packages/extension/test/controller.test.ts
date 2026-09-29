import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Model, QueuedRequest, RequestImage, SessionDetail } from '@pocket-pilot/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatImages } from '../src/control/chatImages';
import type { CheckpointCommands } from '../src/control/checkpointCommands';
import { Controller, type ControllerSources } from '../src/control/controller';
import type { ModelSettingsFile } from '../src/models/modelSettings';

const calls = vi.hoisted((): unknown[][] => []);

vi.mock('vscode', () => ({
  commands: {
    executeCommand: (...args: unknown[]) => {
      calls.push(args);
      return Promise.resolve(undefined);
    }
  },
  Uri: {
    from: (parts: { path: string }) => ({ toString: () => `session:${parts.path}` }),
    file: (path: string) => ({ fsPath: path })
  }
}));

vi.mock('node:timers/promises', () => ({ setTimeout: () => Promise.resolve(true) }));

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 2]);

const model = (id: string): Model => ({
  id: `copilot/${id}`,
  vendor: 'copilot',
  family: id,
  name: id,
  maxInputTokens: null,
  vision: true,
  options: []
});

const queued = (id: string, overrides: Partial<QueuedRequest> = {}): QueuedRequest => ({
  id,
  delivery: 'queued',
  text: `Do ${id}`,
  modeId: 'agent',
  modelId: 'copilot/gpt-5',
  permission: 'default',
  images: [],
  attachments: 0,
  ...overrides
});

const detail = (queue: QueuedRequest[]): SessionDetail => ({
  id: 's1',
  title: 'Chat',
  status: 'running',
  modelId: 'copilot/gpt-5',
  modeId: 'agent',
  permission: 'default',
  totalRequests: 1,
  editedFiles: 0,
  todos: null,
  requests: [],
  queued: queue
});

describe('controller queue', () => {
  let dir: string;
  let expected: QueuedRequest[] | null;

  const controller = (current: SessionDetail): Controller => {
    const sources: ControllerSources = {
      models: () => Promise.resolve([model('gpt-5'), model('o3')]),
      agents: () =>
        Promise.resolve(
          ['agent', 'plan'].map((id) => ({
            id,
            name: id,
            description: null,
            builtin: true,
            handoffs: []
          }))
        ),
      detail: () => Promise.resolve(current),
      image: (_sessionId, requestId, imageId) =>
        Promise.resolve(
          requestId === 'q1' && imageId === 'shot'
            ? { kind: 'requestImage', mimeType: 'image/png', data: PNG.toString('base64') }
            : null
        ),
      editedFiles: () => Promise.resolve([]),
      expectFlags: () => undefined,
      expectQueue: (_sessionId, items) => {
        expected = items;
      },
      expectPermission: () => undefined,
      expectMode: () => undefined,
      expectModel: () => undefined,
      checkpoints: {} as CheckpointCommands,
      images: new ChatImages(dir),
      canOrganize: true,
      settings: {} as ModelSettingsFile
    };
    return new Controller(sources);
  };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'controller-'));
    calls.length = 0;
    expected = null;
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('queues each message again with its own agent, model, approvals and photos', async () => {
    const shot: RequestImage = { id: 'shot', name: 'Pasted Image', mimeType: 'image/png' };
    const current = detail([queued('q1', { delivery: 'steering', images: [shot] }), queued('q2')]);
    await controller(current).run({
      kind: 'setQueue',
      windowId: 'w1',
      sessionId: 's1',
      expected: ['q1', 'q2'],
      queue: [
        {
          id: 'q1',
          delivery: 'steering',
          text: 'Do q1',
          modeId: 'agent',
          modelId: 'copilot/gpt-5',
          permission: 'default',
          images: null
        },
        {
          id: 'q2',
          delivery: 'queued',
          text: 'Plan it',
          modeId: 'plan',
          modelId: 'copilot/o3',
          permission: 'autopilot',
          images: [{ mimeType: 'image/jpeg', data: JPEG.toString('base64') }]
        }
      ]
    });

    const names = calls.map(([name]) => name);
    expect(names).toEqual([
      'vscode.open',
      'workbench.action.chat.removeAllPendingRequests',
      'vscode.open',
      'workbench.action.chat.attachFile',
      'workbench.action.chat.submit',
      'workbench.action.chat.toggleAgentMode',
      'workbench.action.chat.changeModel',
      'vscode.open',
      'workbench.action.chat.submit',
      'vscode.open',
      'workbench.action.chat.attachFile',
      'workbench.action.chat.submit',
      'workbench.action.chat.toggleAgentMode',
      'workbench.action.chat.changeModel',
      'vscode.open',
      'workbench.action.chat.submit'
    ]);
    const submits = calls.filter(([name]) => name === 'workbench.action.chat.submit');
    expect(submits.map(([, options]) => options)).toEqual([
      { inputValue: 'Do q1', acceptInputOptions: { queue: 'steering' } },
      { inputValue: '/autopilot' },
      { inputValue: 'Plan it', acceptInputOptions: { queue: 'queued' } },
      { inputValue: '/disableAutoApprove' }
    ]);
    const modes = calls.filter(([name]) => name === 'workbench.action.chat.toggleAgentMode');
    expect(modes.map(([, options]) => (options as { modeId: string }).modeId)).toEqual([
      'plan',
      'agent'
    ]);

    expect(
      expected?.map(({ id, ...item }) => ({ phone: id.startsWith('phone:'), ...item }))
    ).toEqual([
      {
        phone: true,
        delivery: 'steering',
        text: 'Do q1',
        modeId: 'agent',
        modelId: 'copilot/gpt-5',
        permission: 'default',
        images: [expect.objectContaining({ name: 'photo-1.png', mimeType: 'image/png' })],
        attachments: 0
      },
      {
        phone: true,
        delivery: 'queued',
        text: 'Plan it',
        modeId: 'plan',
        modelId: 'copilot/o3',
        permission: 'autopilot',
        images: [expect.objectContaining({ name: 'photo-1.jpg', mimeType: 'image/jpeg' })],
        attachments: 0
      }
    ]);
    const files = (expected ?? []).flatMap((item) => item.images.map((image) => image.id));
    expect(await Promise.all(files.map((id) => readFile(fileURLToPath(id))))).toEqual([PNG, JPEG]);
  });

  it('sends a known message immediately through VS Code', async () => {
    const current = detail([
      queued('q1', { delivery: 'steering' }),
      queued('q2', { delivery: 'steering' }),
      queued('q3')
    ]);
    await controller(current).run({
      kind: 'sendQueuedNow',
      windowId: 'w1',
      sessionId: 's1',
      expected: ['q1', 'q2', 'q3'],
      id: 'q2'
    });

    expect(calls).toEqual([
      [
        'workbench.action.chat.sendPendingImmediately',
        {
          message: 'Do q2',
          id: 'q2',
          pendingKind: 'steering',
          sessionResource: expect.anything()
        }
      ]
    ]);
    expect(expected?.map((item) => item.id)).toEqual(['q3']);
  });

  it('cancels and queues again to send a message only the phone knows', async () => {
    const current = detail([queued('q1', { delivery: 'steering' }), queued('phone:1')]);
    await controller(current).run({
      kind: 'sendQueuedNow',
      windowId: 'w1',
      sessionId: 's1',
      expected: ['q1', 'phone:1'],
      id: 'phone:1'
    });

    expect(calls.map(([name]) => name)).toEqual([
      'vscode.open',
      'workbench.action.chat.cancel',
      'workbench.action.chat.removeAllPendingRequests',
      'vscode.open',
      'workbench.action.chat.submit',
      'vscode.open',
      'workbench.action.chat.submit'
    ]);
    const submits = calls.filter(([name]) => name === 'workbench.action.chat.submit');
    expect(submits.map(([, options]) => options)).toEqual([
      { inputValue: 'Do phone:1', acceptInputOptions: { queue: 'queued' } },
      { inputValue: 'Do q1', acceptInputOptions: { queue: 'steering' } }
    ]);
    expect(expected?.map(({ delivery, text }) => ({ delivery, text }))).toEqual([
      { delivery: 'steering', text: 'Do q1' }
    ]);
  });

  it('keeps the queue when a kept photo is gone', async () => {
    const lost: RequestImage = { id: 'lost', name: 'Pasted Image', mimeType: 'image/png' };
    const current = detail([queued('q1', { images: [lost] }), queued('q2')]);
    const run = controller(current).run({
      kind: 'setQueue',
      windowId: 'w1',
      sessionId: 's1',
      expected: ['q1', 'q2'],
      queue: ['q2', 'q1'].map((id) => ({
        id,
        delivery: 'queued',
        text: `Do ${id}`,
        modeId: 'agent',
        modelId: 'copilot/gpt-5',
        permission: 'default',
        images: null
      }))
    });
    await expect(run).rejects.toThrow('A queued photo is no longer available');
    expect(calls).toEqual([]);
    expect(expected).toBeNull();
  });
});
