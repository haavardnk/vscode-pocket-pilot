import type { ImageResult, QueuedRequest, ToolImageResult } from '@pocket-pilot/protocol';

import { asArray, asRecord } from '../json';
import { pendingRequest } from './projection';
import { fileImage, requestImage } from './requestImages';
import { requestsOf } from './sessionSummary';
import { toolImage } from './toolParts';

export async function sessionRequestImage(
  root: unknown,
  queued: readonly QueuedRequest[],
  requestId: string,
  imageId: string
): Promise<ImageResult | null> {
  const request =
    requestsOf(root).find((candidate) => candidate.requestId === requestId) ??
    pendingRequest(root, requestId);
  if (request) return requestImage(request, imageId);
  const image = queued
    .find((item) => item.id === requestId)
    ?.images.find((candidate) => candidate.id === imageId);
  return image ? fileImage(image) : null;
}

export function sessionToolImage(
  root: unknown,
  requestId: string,
  callId: string,
  index: number
): ToolImageResult | null {
  const request = requestsOf(root).find((candidate) => candidate.requestId === requestId);
  const part = asArray(request?.response)
    .map(asRecord)
    .find(
      (candidate) =>
        candidate.kind === 'toolInvocationSerialized' && candidate.toolCallId === callId
    );
  return part ? toolImage(part, index) : null;
}
