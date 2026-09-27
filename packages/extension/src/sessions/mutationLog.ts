type PathSegment = string | number;
type Container = Record<PathSegment, unknown>;

export type LogEntry =
  | { kind: 0; v: unknown }
  | { kind: 1; k: PathSegment[]; v: unknown }
  | { kind: 2; k: PathSegment[]; v?: unknown[]; i?: number }
  | { kind: 3; k: PathSegment[] };

function isContainer(value: unknown): value is Container {
  return typeof value === 'object' && value !== null;
}

function isPath(value: unknown): value is PathSegment[] {
  return (
    Array.isArray(value) &&
    value.every((segment) => typeof segment === 'string' || typeof segment === 'number')
  );
}

export function parseLogEntry(line: string): LogEntry | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isContainer(raw)) return null;
  if (raw.kind === 0) return { kind: 0, v: raw.v };
  if (!isPath(raw.k)) return null;
  if (raw.kind === 1) return { kind: 1, k: raw.k, v: raw.v };
  if (raw.kind === 3) return { kind: 3, k: raw.k };
  if (raw.kind !== 2) return null;
  const values = Array.isArray(raw.v) ? raw.v : undefined;
  const index = typeof raw.i === 'number' ? raw.i : undefined;
  return {
    kind: 2,
    k: raw.k,
    ...(values && { v: values }),
    ...(index !== undefined && { i: index })
  };
}

function parentOf(root: unknown, path: PathSegment[]): Container | null {
  let current: unknown = root;
  for (const segment of path.slice(0, -1)) {
    if (!isContainer(current)) return null;
    current = current[segment];
  }
  return isContainer(current) ? current : null;
}

export function applyLogEntry(root: unknown, entry: LogEntry): unknown {
  if (entry.kind === 0) return entry.v;
  const key = entry.k.at(-1);
  const parent = parentOf(root, entry.k);
  if (key === undefined || !parent) throw new Error(`Invalid log path ${entry.k.join('.')}`);
  if (entry.kind === 1) {
    parent[key] = entry.v;
    return root;
  }
  if (entry.kind === 3) {
    delete parent[key];
    return root;
  }
  const existing = parent[key];
  const array: unknown[] = Array.isArray(existing) ? existing : [];
  if (entry.i !== undefined) array.length = entry.i;
  for (const item of entry.v ?? []) array.push(item);
  parent[key] = array;
  return root;
}
