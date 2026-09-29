import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  type Command,
  type ImageResult,
  type Model,
  PHONE_QUEUE_PREFIX,
  type QueuedRequest,
  type QueueEntry,
  queueEntry,
  queuePlan,
  type RequestImage,
  sendNowSplit,
  type SessionDetail
} from '@pocket-pilot/protocol';
import * as vscode from 'vscode';

import type { ChatImages, ImageData } from './chatImages';
import type { ChatInput, ChatInputs, InputChange } from './chatInput';
import { focusChat, sessionResource, submitChat } from './chatSession';

export interface QueueSources {
  models: () => Promise<Model[]>;
  detail: (sessionId: string) => Promise<SessionDetail | null>;
  image: (sessionId: string, requestId: string, imageId: string) => Promise<ImageResult | null>;
  expectQueue: (sessionId: string, items: QueuedRequest[]) => void;
  images: ChatImages;
}

interface QueuedSubmit extends InputChange {
  entry: QueueEntry;
  images: ImageData[];
  paths: string[];
}

export function queuedImages(
  paths: readonly string[],
  images: readonly ImageData[]
): RequestImage[] {
  return paths.flatMap((path, index) => {
    const image = images[index];
    return image
      ? [{ id: pathToFileURL(path).href, name: basename(path), mimeType: image.mimeType }]
      : [];
  });
}

export class QueueRewrite {
  constructor(
    private readonly sources: QueueSources,
    private readonly inputs: ChatInputs
  ) {}

  async apply(command: Extract<Command, { kind: 'setQueue' }>): Promise<void> {
    const detail = await this.sources.detail(command.sessionId);
    if (!detail) throw new Error('Chat not found');
    const current = detail.queued;
    const plan = queuePlan(current, command.expected, command.queue);
    if (plan.kind === 'remove') {
      for (const id of plan.ids) {
        await vscode.commands.executeCommand('workbench.action.chat.removePendingRequest', {
          sessionResource: sessionResource(command.sessionId),
          pendingRequestId: id
        });
      }
      this.sources.expectQueue(
        command.sessionId,
        current.filter((item) => !plan.ids.includes(item.id))
      );
      return;
    }
    this.sources.expectQueue(
      command.sessionId,
      await this.rewrite(command.sessionId, detail, command.queue, false)
    );
  }

  async sendNow(command: Extract<Command, { kind: 'sendQueuedNow' }>): Promise<void> {
    const detail = await this.sources.detail(command.sessionId);
    if (!detail) throw new Error('Chat not found');
    const { target, rest } = sendNowSplit(detail.queued, command.expected, command.id);
    if (target.id.startsWith(PHONE_QUEUE_PREFIX)) {
      const others = detail.queued.filter((item) => item !== target);
      const queued = await this.rewrite(
        command.sessionId,
        detail,
        [target, ...others].map(queueEntry),
        true
      );
      this.sources.expectQueue(command.sessionId, queued.slice(1));
      return;
    }
    await vscode.commands.executeCommand('workbench.action.chat.sendPendingImmediately', {
      message: target.text,
      id: target.id,
      pendingKind: target.delivery,
      sessionResource: sessionResource(command.sessionId)
    });
    this.sources.expectQueue(command.sessionId, rest);
  }

  private async rewrite(
    sessionId: string,
    detail: SessionDetail,
    entries: readonly QueueEntry[],
    cancel: boolean
  ): Promise<QueuedRequest[]> {
    const submits: QueuedSubmit[] = [];
    for (const entry of entries) {
      submits.push(await this.queuedSubmit(sessionId, entry, detail.queued));
    }
    await focusChat(sessionId);
    if (cancel) await vscode.commands.executeCommand('workbench.action.chat.cancel');
    await vscode.commands.executeCommand('workbench.action.chat.removeAllPendingRequests');
    let input: ChatInput = detail;
    const queued: QueuedRequest[] = [];
    try {
      for (const submit of submits) {
        input = await this.inputs.change(sessionId, input, submit);
        await submitChat(sessionId, submit.entry.text, submit.paths, submit.entry.delivery);
        queued.push({
          id: PHONE_QUEUE_PREFIX + randomUUID(),
          delivery: submit.entry.delivery,
          text: submit.entry.text,
          ...input,
          images: queuedImages(submit.paths, submit.images),
          attachments: 0
        });
      }
    } finally {
      const model = (await this.sources.models()).find((item) => item.id === detail.modelId);
      await this.inputs.change(sessionId, input, {
        modeId: detail.modeId,
        model: model ?? null,
        permission: detail.permission
      });
    }
    return queued;
  }

  private async queuedSubmit(
    sessionId: string,
    entry: QueueEntry,
    current: readonly QueuedRequest[]
  ): Promise<QueuedSubmit> {
    if (entry.modeId) await this.inputs.requireAgent(entry.modeId);
    const model = entry.modelId ? await this.inputs.requireModel(entry.modelId) : null;
    const images = entry.images ?? (await this.keptImages(sessionId, entry.id, current));
    const paths = await this.sources.images.write(images);
    return { entry, modeId: entry.modeId, model, permission: entry.permission, images, paths };
  }

  private async keptImages(
    sessionId: string,
    id: string,
    current: readonly QueuedRequest[]
  ): Promise<ImageData[]> {
    const shown = current.find((item) => item.id === id)?.images ?? [];
    const images = await Promise.all(
      shown.map((image) => this.sources.image(sessionId, id, image.id))
    );
    const found = images.filter((image) => image !== null);
    if (found.length < shown.length) throw new Error('A queued photo is no longer available');
    return found;
  }
}
