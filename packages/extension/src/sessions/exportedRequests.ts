import { asArray, asNumber, asRecord, asString, type JsonRecord } from '../json';
import { requestState } from './projection';
import { requestsOf } from './sessionEntry';

function asksQuestions(request: JsonRecord): boolean {
  return asArray(request.response).some((part) => {
    const record = asRecord(part);
    return record.kind === 'questionCarousel' && record.isUsed !== true;
  });
}

function waitingRequests(root: unknown): Map<string, boolean> {
  return new Map(
    requestsOf(root).flatMap((request) => {
      const id = asString(request.requestId);
      return id !== null && requestState(request) === 'needsInput'
        ? [[id, asksQuestions(request)] as const]
        : [];
    })
  );
}

function exportedRequest(
  request: JsonRecord,
  at: number,
  waiting: ReadonlyMap<string, boolean>
): JsonRecord {
  const state = asRecord(request.modelState);
  const completedAt = asNumber(state.completedAt);
  if (state.value !== 2 || completedAt === null || completedAt < at) return request;
  const id = asString(request.requestId);
  const needsInput = asksQuestions(request) || (id !== null && waiting.get(id) === false);
  return { ...request, modelState: { value: needsInput ? 4 : 0 } };
}

export function exportedRequests(
  exported: JsonRecord[],
  loggedRoot: unknown,
  at: number
): JsonRecord[] {
  const waiting = waitingRequests(loggedRoot);
  return exported.map((request) => exportedRequest(request, at, waiting));
}
