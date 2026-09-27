import { z } from 'zod';

import {
  requestViewSchema,
  responsePartSchema,
  type SessionDetail,
  sessionDetailSchema
} from './domain.ts';

export const requestPatchSchema = requestViewSchema.omit({ parts: true }).extend({
  partsFrom: z.number().int().min(0),
  parts: z.array(responsePartSchema)
});

export const sessionPatchSchema = sessionDetailSchema.omit({ requests: true }).extend({
  requestsFrom: z.number().int().min(0),
  requests: z.array(requestPatchSchema)
});

export type RequestPatch = z.infer<typeof requestPatchSchema>;
export type SessionPatch = z.infer<typeof sessionPatchSchema>;

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function commonPrefix<T>(before: readonly T[], after: readonly T[]): number {
  let index = 0;
  while (index < before.length && index < after.length && same(before[index], after[index])) {
    index += 1;
  }
  return index;
}

export function diffDetail(previous: SessionDetail, next: SessionDetail): SessionPatch | null {
  const { requests: before, ...previousFields } = previous;
  const { requests, ...fields } = next;
  const requestsFrom = commonPrefix(before, requests);
  if (requestsFrom === requests.length && requestsFrom === before.length) {
    if (same(previousFields, fields)) return null;
  }
  return {
    ...fields,
    requestsFrom,
    requests: requests.slice(requestsFrom).map(({ parts, ...request }, index) => {
      const old = before[requestsFrom + index];
      const partsFrom = old?.id === request.id ? commonPrefix(old.parts, parts) : 0;
      return { ...request, partsFrom, parts: parts.slice(partsFrom) };
    })
  };
}

export function applyPatch(detail: SessionDetail, patch: SessionPatch): void {
  const { requestsFrom, requests, ...fields } = patch;
  Object.assign(detail, fields);
  const patched = requests.map(({ partsFrom, parts, ...request }, index) => {
    const old = detail.requests[requestsFrom + index];
    if (!old || partsFrom === 0) return { ...request, parts };
    Object.assign(old, request);
    old.parts.splice(partsFrom, old.parts.length - partsFrom, ...parts);
    return old;
  });
  detail.requests.splice(requestsFrom, detail.requests.length - requestsFrom, ...patched);
}
