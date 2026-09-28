import { z } from 'zod';

const rangeSchema = z.object({
  startLineNumber: z.number().int(),
  startColumn: z.number().int(),
  endLineNumber: z.number().int(),
  endColumn: z.number().int()
});

const textEditSchema = z.object({ text: z.string(), range: rangeSchema });

const fileUriSchema = z.object({ scheme: z.literal('file'), fsPath: z.string() });

const operationSchema = z.object({
  type: z.string(),
  uri: fileUriSchema,
  requestId: z.string(),
  epoch: z.number(),
  edits: z.array(textEditSchema).optional(),
  initialContent: z.string().optional()
});

const baselineSchema = z.object({
  uri: fileUriSchema,
  requestId: z.string(),
  content: z.string()
});

const checkpointSchema = z.object({
  requestId: z.string().optional(),
  undoStopId: z.string().optional(),
  epoch: z.number()
});

const stateSchema = z.object({
  timeline: z.object({
    checkpoints: z.array(z.unknown()).optional(),
    operations: z.array(z.unknown()),
    fileBaselines: z.array(z.tuple([z.string(), z.unknown()]))
  })
});

export type TextEdit = z.infer<typeof textEditSchema>;

export interface TimelineOperation {
  type: string;
  path: string;
  requestId: string;
  epoch: number;
  edits: TextEdit[];
  initialContent: string | null;
}

export interface Checkpoint {
  requestId: string | null;
  stopId: string | null;
  epoch: number;
}

export interface Timeline {
  baselines: Map<string, string>;
  checkpoints: Checkpoint[];
  operations: TimelineOperation[];
}

export interface RequestEdit {
  before: string | null;
  after: string | null;
}

export interface StopEdit extends RequestEdit {
  final: boolean;
}

function baselineKey(requestId: string, path: string): string {
  return `${requestId}\n${path}`;
}

export function parseTimeline(raw: unknown): Timeline {
  const parsed = stateSchema.safeParse(raw);
  if (!parsed.success) return { baselines: new Map(), checkpoints: [], operations: [] };
  const { checkpoints, operations, fileBaselines } = parsed.data.timeline;
  return {
    checkpoints: (checkpoints ?? [])
      .flatMap((value) => {
        const checkpoint = checkpointSchema.safeParse(value);
        if (!checkpoint.success) return [];
        const { requestId, undoStopId, epoch } = checkpoint.data;
        return [{ requestId: requestId ?? null, stopId: undoStopId ?? null, epoch }];
      })
      .sort((a, b) => a.epoch - b.epoch),
    baselines: new Map(
      fileBaselines.flatMap(([, value]) => {
        const baseline = baselineSchema.safeParse(value);
        if (!baseline.success) return [];
        const { uri, requestId, content } = baseline.data;
        return [[baselineKey(requestId, uri.fsPath), content] as const];
      })
    ),
    operations: operations.flatMap((value) => {
      const operation = operationSchema.safeParse(value);
      if (!operation.success) return [];
      const { type, uri, requestId, epoch, edits, initialContent } = operation.data;
      return [
        {
          type,
          path: uri.fsPath,
          requestId,
          epoch,
          edits: edits ?? [],
          initialContent: initialContent ?? null
        }
      ];
    })
  };
}

export function applyEdits(text: string, edits: readonly TextEdit[]): string {
  const starts = [0];
  for (let index = text.indexOf('\n'); index >= 0; index = text.indexOf('\n', index + 1)) {
    starts.push(index + 1);
  }
  const offset = (line: number, column: number): number => {
    if (line > starts.length) return text.length;
    const index = Math.max(line, 1) - 1;
    const start = starts[index] ?? 0;
    const next = starts[index + 1];
    const newline = next === undefined ? text.length : next - 1;
    const end = next !== undefined && text[newline - 1] === '\r' ? newline - 1 : newline;
    return Math.min(start + Math.max(column, 1) - 1, end);
  };
  return edits
    .map(({ text: replacement, range }) => ({
      replacement,
      start: offset(range.startLineNumber, range.startColumn),
      end: offset(range.endLineNumber, range.endColumn)
    }))
    .sort((a, b) => b.start - a.start || b.end - a.end)
    .reduce(
      (result, edit) => result.slice(0, edit.start) + edit.replacement + result.slice(edit.end),
      text
    );
}

export function requestPaths(timeline: Timeline, requestId: string): string[] {
  return [
    ...new Set(
      timeline.operations
        .filter((operation) => operation.requestId === requestId)
        .map((operation) => operation.path)
    )
  ];
}

function fileOperations(timeline: Timeline, requestId: string, path: string): TimelineOperation[] {
  return timeline.operations
    .filter((operation) => operation.requestId === requestId && operation.path === path)
    .sort((a, b) => a.epoch - b.epoch);
}

function replay(
  content: string | null,
  operations: readonly TimelineOperation[]
): string | null | undefined {
  let result = content;
  for (const operation of operations) {
    if (operation.type === 'create') result = operation.initialContent ?? '';
    else if (operation.type === 'delete') result = null;
    else if (operation.type === 'textEdit' && result !== null)
      result = applyEdits(result, operation.edits);
    else return undefined;
  }
  return result;
}

function requestBaseline(
  timeline: Timeline,
  requestId: string,
  path: string,
  first: TimelineOperation
): string | null | undefined {
  const baseline = timeline.baselines.get(baselineKey(requestId, path));
  if (baseline === undefined && first.type !== 'create') return undefined;
  return baseline ?? null;
}

export function requestEdit(
  timeline: Timeline,
  requestId: string,
  path: string
): RequestEdit | null {
  const operations = fileOperations(timeline, requestId, path);
  const [first] = operations;
  if (!first) return null;
  const before = requestBaseline(timeline, requestId, path, first);
  if (before === undefined) return null;
  const after = replay(before, operations);
  return after === undefined ? null : { before, after };
}

export function stopEdit(
  timeline: Timeline,
  requestId: string,
  stopId: string,
  path: string
): StopEdit | null {
  const index = timeline.checkpoints.findIndex(
    (checkpoint) => checkpoint.requestId === requestId && checkpoint.stopId === stopId
  );
  const start = timeline.checkpoints[index];
  if (!start) return null;
  const end = timeline.checkpoints[index + 1]?.epoch ?? Infinity;
  const operations = fileOperations(timeline, requestId, path);
  const inside = operations.filter(
    (operation) => operation.epoch >= start.epoch && operation.epoch < end
  );
  const [first] = operations;
  if (!first || inside.length === 0) return null;
  const baseline = requestBaseline(timeline, requestId, path, first);
  if (baseline === undefined) return null;
  const before = replay(
    baseline,
    operations.filter((operation) => operation.epoch < start.epoch)
  );
  if (before === undefined) return null;
  const after = replay(before, inside);
  return after === undefined ? null : { before, after, final: end !== Infinity };
}
