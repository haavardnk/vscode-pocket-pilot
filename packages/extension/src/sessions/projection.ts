import {
  type PermissionLevel,
  permissionLevelSchema,
  type QueuedRequest,
  type RequestImage,
  type RequestView,
  type SessionDetail
} from '@pocket-pilot/protocol';

import { asArray, asNumber, asRecord, asString, type JsonRecord } from '../json';
import { type Activity, withActivity } from './activityParts';
import { withoutEditFences } from './editFences';
import { requestImages } from './requestImages';
import { mergeParts, type PartContext, projectPart } from './responseParts';
import { type LogSummary, requestsOf, requestState, requestText } from './sessionSummary';
import { sessionTodos } from './todos';
import { writtenPaths } from './toolParts';
import { toolCallId } from './transcript';

function sessionPermission(root: JsonRecord): PermissionLevel {
  const level = permissionLevelSchema.safeParse(asRecord(root.inputState).permissionLevel);
  return level.success ? level.data : 'default';
}

function projectRequest(request: JsonRecord, latest: boolean, activity: Activity): RequestView {
  const logged = requestState(request);
  const state = latest && activity.settled && logged === 'pending' ? 'complete' : logged;
  const context: PartContext = {
    state,
    latest,
    statuses: activity.statuses,
    stopId: null,
    callId: null,
    writers: new Map()
  };
  const parts = withoutEditFences(asArray(request.response).map(asRecord)).flatMap((part) => {
    if (part.kind === 'undoStop') context.stopId = asString(part.id);
    const paths = part.kind === 'toolInvocationSerialized' ? writtenPaths(part) : null;
    const raw = asString(part.toolCallId);
    if (paths && raw) {
      const callId = toolCallId(raw);
      context.callId = callId;
      for (const path of paths) context.writers.set(path, callId);
    }
    const projected = projectPart(part, context);
    return projected ? [projected] : [];
  });
  const error = asRecord(asRecord(request.result).errorDetails);
  const id = asString(request.requestId) ?? '';
  return {
    id,
    timestamp: asNumber(request.timestamp) ?? 0,
    message: requestText(request),
    modelId: asString(request.modelId),
    agentName: asString(asRecord(asRecord(request.modeInfo).modeInstructions).name),
    state,
    error: state === 'failed' ? (asString(error.message) ?? 'Request failed') : null,
    editable: id !== '',
    disabled: false,
    editedPaths: [],
    images: requestImages(request),
    parts: mergeParts(parts)
  };
}

function attachmentCount(request: JsonRecord, images: readonly RequestImage[]): number {
  return asArray(asRecord(request.variableData).variables).filter((raw) => {
    const variable = asRecord(raw);
    const id = asString(variable.id) ?? '';
    return (
      variable.kind !== 'implicit' &&
      variable.kind !== 'workspace' &&
      !id.startsWith('vscode.implicit') &&
      variable.automaticallyAdded !== true &&
      variable.range === undefined &&
      !images.some((image) => image.id === id)
    );
  }).length;
}

function queuedMode(modeInfo: JsonRecord): string | null {
  if (modeInfo.isBuiltin === false) {
    return asString(asRecord(asRecord(modeInfo.modeInstructions).uri).external);
  }
  return asString(modeInfo.modeId) ?? asString(modeInfo.telemetryModeId);
}

export function pendingRequest(root: unknown, id: string): JsonRecord | null {
  const pending = asArray(asRecord(root).pendingRequests)
    .map(asRecord)
    .find((candidate) => candidate.id === id);
  return pending ? asRecord(pending.request) : null;
}

function projectQueued(root: JsonRecord): QueuedRequest[] {
  return asArray(root.pendingRequests).map((raw) => {
    const pending = asRecord(raw);
    const request = asRecord(pending.request);
    const options = asRecord(pending.sendOptions);
    const modeInfo = asRecord(options.modeInfo ?? request.modeInfo);
    const permission = permissionLevelSchema.safeParse(modeInfo.permissionLevel);
    const images = requestImages(request);
    return {
      id: asString(pending.id) ?? '',
      delivery: pending.kind === 'steering' ? 'steering' : 'queued',
      text: requestText(request),
      modeId: queuedMode(modeInfo),
      modelId: asString(options.userSelectedModelId),
      permission: permission.success ? permission.data : null,
      images,
      attachments: attachmentCount(request, images)
    };
  });
}

export function editedPaths(root: unknown): string[] {
  const paths = requestsOf(root).flatMap((request) =>
    asArray(request.response).flatMap((raw) => {
      const part = asRecord(raw);
      if (part.kind !== 'textEditGroup' && part.kind !== 'notebookEditGroup') return [];
      const uri = asRecord(part.uri);
      const path = asString(uri.fsPath) ?? asString(uri.path);
      return path && (uri.scheme ?? 'file') === 'file' ? [path] : [];
    })
  );
  return [...new Set(paths)];
}

export function projectDetail(
  root: unknown,
  summary: LogSummary,
  limit: number,
  activity: Activity,
  pending: RequestView[]
): SessionDetail {
  const session = asRecord(root);
  const requests = requestsOf(session);
  const last = pending.length > 0 ? undefined : requests.at(-1);
  const unlogged = pending.slice(-limit);
  const shown = requests.slice(Math.max(0, requests.length - limit + unlogged.length));
  const active = summary.status === 'running' || summary.status === 'needsInput';
  const views = shown.map((request) => {
    const view = projectRequest(request, request === last, activity);
    return request === last && active
      ? { ...view, parts: withActivity(view.parts, activity) }
      : view;
  });
  return {
    id: summary.id,
    title: summary.title,
    status: summary.status,
    modelId: summary.modelId,
    modeId: summary.modeId,
    permission: sessionPermission(session),
    totalRequests: requests.length + pending.length,
    editedFiles: editedPaths(session).length,
    todos: sessionTodos(requests),
    requests: [...views, ...unlogged],
    queued: projectQueued(session)
  };
}
