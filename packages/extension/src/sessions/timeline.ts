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

const stateSchema = z.object({
  timeline: z.object({
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

export interface Timeline {
  baselines: Map<string, string>;
  operations: TimelineOperation[];
}

export interface RequestEdit {
  before: string | null;
  after: string | null;
}

function baselineKey(requestId: string, path: string): string {
  return `${requestId}\n${path}`;
}

export function parseTimeline(raw: unknown): Timeline {
  const parsed = stateSchema.safeParse(raw);
  if (!parsed.success) return { baselines: new Map(), operations: [] };
  const { operations, fileBaselines } = parsed.data.timeline;
  return {
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

export function requestEdit(
  timeline: Timeline,
  requestId: string,
  path: string
): RequestEdit | null {
  const operations = timeline.operations
    .filter((operation) => operation.requestId === requestId && operation.path === path)
    .sort((a, b) => a.epoch - b.epoch);
  const [first] = operations;
  if (!first) return null;
  const baseline = timeline.baselines.get(baselineKey(requestId, path));
  if (baseline === undefined && first.type !== 'create') return null;
  const before = baseline ?? null;
  let after = before;
  for (const operation of operations) {
    if (operation.type === 'create') after = operation.initialContent ?? '';
    else if (operation.type === 'delete') after = null;
    else if (operation.type === 'textEdit' && after !== null)
      after = applyEdits(after, operation.edits);
    else return null;
  }
  return { before, after };
}
