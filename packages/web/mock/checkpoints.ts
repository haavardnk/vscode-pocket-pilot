import type { SessionDetail } from '@pocket-pilot/protocol';

export function restoreCheckpoint(detail: SessionDetail, requestId: string): void {
  const index = detail.requests.findIndex((request) => request.id === requestId);
  const request = detail.requests[index];
  if (!request?.editable) throw new Error('This message can no longer be restored');
  if (request.disabled) throw new Error('This message is already undone');
  for (const later of detail.requests.slice(index)) {
    later.disabled = true;
    if (later.state === 'pending' || later.state === 'needsInput') later.state = 'cancelled';
  }
  detail.status = 'idle';
  detail.queued = [];
}

export function redoCheckpoint(detail: SessionDetail): void {
  if (!detail.requests.some((request) => request.disabled)) {
    throw new Error('There is nothing to redo');
  }
  for (const request of detail.requests) request.disabled = false;
}

export function dropDisabled(detail: SessionDetail): void {
  const index = detail.requests.findIndex((request) => request.disabled);
  if (index < 0) return;
  detail.totalRequests -= detail.requests.length - index;
  detail.requests.splice(index);
}
