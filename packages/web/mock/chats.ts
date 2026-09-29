import {
  type Command,
  type ImageResult,
  type ImageUpload,
  queuePlan,
  type RequestImage,
  sendNowSplit,
  type SessionDetail
} from '@pocket-pilot/protocol';

import { dropDisabled, redoCheckpoint, restoreCheckpoint } from './checkpoints.ts';
import { type MockWindow, samplePhotos } from './fixtures.ts';

type ToolPart = Extract<SessionDetail['requests'][number]['parts'][number], { kind: 'tool' }>;

export type ChatCommand = Exclude<
  Extract<Command, { sessionId: string }>,
  { kind: 'editDecision' | 'setPinned' | 'setArchived' }
>;

export interface ChatHost {
  id(prefix: string): string;
  later(action: () => void): void;
  changed(window: MockWindow, sessionId: string): void;
  runTool(window: MockWindow, sessionId: string, tool: ToolPart): void;
}

export class MockChats {
  private photos = new Map<string, ImageResult>();

  private readonly host: ChatHost;

  constructor(host: ChatHost) {
    this.host = host;
  }

  reset(): void {
    this.photos = samplePhotos();
  }

  photo(requestId: string, imageId: string): ImageResult {
    const photo = this.photos.get(`${requestId}/${imageId}`);
    if (!photo) throw new Error('Photo is no longer available');
    return photo;
  }

  create(window: MockWindow, command: Extract<Command, { kind: 'newSession' }>): void {
    const id = this.host.id('session');
    window.details.set(id, {
      id,
      title: command.text.slice(0, 40),
      status: 'idle',
      modelId: command.modelId,
      modeId: command.modeId ?? 'agent',
      permission: 'default',
      editedFiles: 0,
      todos: null,
      totalRequests: 0,
      requests: [],
      queued: []
    });
    this.host.later(() => this.ask(window, id, command.text, command.images));
  }

  run(window: MockWindow, detail: SessionDetail, command: ChatCommand): void {
    if (command.kind === 'send') {
      if (detail.status === 'idle' || detail.status === 'failed') {
        dropDisabled(detail);
        this.host.changed(window, detail.id);
        this.host.later(() => this.ask(window, detail.id, command.text, command.images));
      } else {
        const id = this.host.id('queued');
        detail.queued.push({
          id,
          delivery: command.delivery ?? 'queued',
          text: command.text,
          modeId: detail.modeId,
          modelId: detail.modelId,
          permission: detail.permission,
          images: this.keepPhotos(id, command.images),
          attachments: 0
        });
        this.host.changed(window, detail.id);
      }
      return;
    }
    if (command.kind === 'setQueue') {
      const plan = queuePlan(detail.queued, command.expected, command.queue);
      detail.queued =
        plan.kind === 'remove'
          ? detail.queued.filter((item) => !plan.ids.includes(item.id))
          : command.queue.map(({ images, ...entry }) => {
              const id = this.host.id('queued');
              const before = detail.queued.find((item) => item.id === entry.id);
              before?.images.forEach((image) => {
                const photo = this.photos.get(`${entry.id}/${image.id}`);
                if (photo) this.photos.set(`${id}/${image.id}`, photo);
              });
              return {
                ...entry,
                id,
                images: images ? this.keepPhotos(id, images) : (before?.images ?? []),
                attachments: 0
              };
            });
      this.host.changed(window, detail.id);
      return;
    }
    if (command.kind === 'sendQueuedNow') {
      const { sent, rest } = sendNowSplit(detail.queued, command.expected, command.id);
      this.cancel(detail);
      detail.queued = rest;
      this.ask(window, detail.id, sent.map((item) => item.text).join('\n\n'));
      return;
    }
    if (command.kind === 'stop') {
      this.cancel(detail);
      detail.queued = [];
      this.host.changed(window, detail.id);
      return;
    }
    if (command.kind === 'toolDecision') {
      const last = detail.requests.at(-1);
      const tool = last?.parts.find((part) => part.kind === 'tool' && part.awaitingConfirmation);
      if (!last || tool?.kind !== 'tool') throw new Error('No tool is waiting');
      tool.awaitingConfirmation = false;
      tool.grouped = true;
      tool.status = command.decision === 'accept' ? 'done' : 'failed';
      if (command.decision === 'accept') this.host.runTool(window, detail.id, tool);
      last.parts.push({
        kind: 'markdown',
        text: command.decision === 'accept' ? 'Tests passed.' : 'Skipped the tool.',
        baseUri: null
      });
      this.host.changed(window, detail.id);
      this.host.later(() => this.finish(window, detail.id, 'All done.'));
      return;
    }
    if (command.kind === 'answerQuestions') {
      const last = detail.requests.at(-1);
      const part = last?.parts.find(
        (candidate) => candidate.kind === 'questions' && candidate.resolveId === command.resolveId
      );
      if (!last || part?.kind !== 'questions' || part.state !== 'pending') {
        throw new Error('The questions are no longer waiting');
      }
      part.state = 'done';
      part.answers = command.answers;
      last.state = 'pending';
      detail.status = 'running';
      this.host.changed(window, detail.id);
      this.host.later(() =>
        this.finish(
          window,
          detail.id,
          command.answers ? 'Thanks, planning now.' : 'Going with defaults.'
        )
      );
      return;
    }
    if (command.kind === 'confirm') {
      const part = detail.requests
        .at(-1)
        ?.parts.find(
          (candidate) => candidate.kind === 'confirmation' && candidate.state === 'pending'
        );
      if (part?.kind !== 'confirmation' || !part.buttons.includes(command.button)) {
        throw new Error('Nothing is waiting for confirmation');
      }
      part.state = 'done';
      this.ask(window, detail.id, `${command.button}: "${part.title}"`);
      return;
    }
    if (command.kind === 'acceptElicitation') {
      const part = detail.requests
        .at(-1)
        ?.parts.find(
          (candidate) => candidate.kind === 'elicitation' && candidate.state === 'pending'
        );
      if (part?.kind !== 'elicitation') throw new Error('Nothing is waiting for approval');
      part.state = 'accepted';
      this.host.changed(window, detail.id);
      return;
    }
    if (command.kind === 'handoff') {
      const agents = window.state.agents;
      const handoff = agents
        .find((agent) => agent.id === command.agentId)
        ?.handoffs.find((item) => item.id === command.handoffId);
      if (!handoff) throw new Error('This handoff is no longer offered');
      const target =
        agents.find((agent) => agent.id === handoff.agent) ??
        agents.find((agent) => agent.name === handoff.agent);
      if (target) detail.modeId = target.id;
      if (command.autopilot) detail.permission = 'autopilot';
      this.host.changed(window, detail.id);
      if (handoff.send) this.host.later(() => this.ask(window, detail.id, handoff.prompt));
      return;
    }
    if (command.kind === 'restoreCheckpoint') {
      restoreCheckpoint(detail, command.requestId);
      this.host.changed(window, detail.id);
      return;
    }
    if (command.kind === 'redoCheckpoint') {
      redoCheckpoint(detail);
      this.host.changed(window, detail.id);
      return;
    }
    if (command.kind === 'editRequest') {
      restoreCheckpoint(detail, command.requestId);
      dropDisabled(detail);
      if (command.modeId) detail.modeId = command.modeId;
      if (command.modelId) detail.modelId = command.modelId;
      detail.permission = command.permission;
      this.host.changed(window, detail.id);
      this.host.later(() => this.ask(window, detail.id, command.text, command.images));
      return;
    }
    if (command.kind === 'setPermission') {
      dropDisabled(detail);
      detail.permission = command.level;
    }
    if (command.kind === 'setMode') detail.modeId = command.modeId;
    if (command.kind === 'setModel') detail.modelId = command.modelId;
    this.host.changed(window, detail.id);
  }

  private cancel(detail: SessionDetail): void {
    const last = detail.requests.at(-1);
    if (last?.state === 'pending' || last?.state === 'needsInput') last.state = 'cancelled';
    last?.parts.forEach((part) => {
      if ((part.kind === 'questions' || part.kind === 'confirmation') && part.state === 'pending') {
        part.state = 'expired';
      }
      if (part.kind !== 'tool') return;
      part.awaitingConfirmation = false;
      part.grouped = true;
      if (part.status === 'running') part.status = 'failed';
    });
    detail.status = 'idle';
  }

  private keepPhotos(requestId: string, images: ImageUpload[]): RequestImage[] {
    return images.map((image, index) => {
      const id = `photo-${index + 1}`;
      this.photos.set(`${requestId}/${id}`, { kind: 'requestImage', ...image });
      return { id, name: `Photo ${index + 1}`, mimeType: image.mimeType };
    });
  }

  private ask(
    window: MockWindow,
    sessionId: string,
    text: string,
    images: ImageUpload[] = []
  ): void {
    const detail = window.details.get(sessionId);
    if (!detail) return;
    const requestId = this.host.id('request');
    detail.requests.push({
      id: requestId,
      timestamp: Date.now(),
      message: text,
      modelId: detail.modelId,
      agentName:
        window.state.agents.find((agent) => agent.id === detail.modeId && agent.id !== 'agent')
          ?.name ?? null,
      state: 'pending',
      error: null,
      editable: true,
      disabled: false,
      editedPaths: [],
      images: this.keepPhotos(requestId, images),
      parts: [
        {
          kind: 'tool',
          callId: this.host.id('call'),
          toolId: 'read_file',
          message: 'Read `README.md`',
          detail: null,
          links: [],
          images: 0,
          title: null,
          grouped: true,
          awaitingConfirmation: false,
          status: 'running',
          terminal: null,
          subagent: null,
          parentCallId: null
        }
      ]
    });
    detail.totalRequests += 1;
    detail.status = 'running';
    this.host.changed(window, sessionId);
    this.host.later(() => this.finish(window, sessionId, `Done: ${text}`));
  }

  private finish(window: MockWindow, sessionId: string, reply: string): void {
    const detail = window.details.get(sessionId);
    const last = detail?.requests.at(-1);
    if (!detail || last?.state !== 'pending') return;
    last.parts.forEach((part) => {
      if (part.kind === 'tool' && part.status === 'running') part.status = 'done';
    });
    last.parts.push({ kind: 'markdown', text: reply, baseUri: null });
    last.state = 'complete';
    detail.status = 'idle';
    this.host.changed(window, sessionId);
    const next = detail.queued.shift();
    if (next) this.ask(window, sessionId, next.text);
  }
}
