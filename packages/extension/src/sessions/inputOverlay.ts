import { asRecord, asString } from '../json';
import type { Expected, SessionEntry } from './sessionEntry';
import { requestsOf } from './sessionSummary';

const INPUT_OVERLAY_MS = 120_000;
const COARSE_MTIME_LAG_MS = 20;

export function expectedOr<T>(expected: Expected<T> | null, logged: T): T {
  return expected && Date.now() - expected.at < INPUT_OVERLAY_MS ? expected.value : logged;
}

export function withoutRemoved(root: unknown, removed: Expected<string> | null): unknown {
  const requestId = expectedOr<string | null>(removed, null);
  if (requestId === null) return root;
  const requests = requestsOf(root);
  const index = requests.findIndex((request) => asString(request.requestId) === requestId);
  return index < 0 ? root : { ...asRecord(root), requests: requests.slice(0, index) };
}

export function clearLoggedInputs(entry: SessionEntry, modified: number): void {
  const written = modified + COARSE_MTIME_LAG_MS;
  if (entry.permission && written >= entry.permission.at) entry.permission = null;
  if (entry.mode && written >= entry.mode.at) entry.mode = null;
  if (entry.model && written >= entry.model.at) entry.model = null;
  if (entry.removed && written >= entry.removed.at) entry.removed = null;
}
