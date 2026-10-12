import type { RequestView, ToolStatus } from '@pocket-pilot/protocol';

import { activityParts } from './activityParts';
import { type LogSummary, previewText, titleText } from './sessionSummary';
import { transcriptNotice, type TranscriptTurn } from './transcript';

export interface LogMark {
  writtenAt: number;
  lastRequestAt: number | null;
}

export function unloggedTurns(turns: TranscriptTurn[], mark: LogMark): TranscriptTurn[] {
  const { lastRequestAt } = mark;
  const known = lastRequestAt === null ? -1 : turns.findIndex((turn) => turn.at >= lastRequestAt);
  return turns.filter((turn, index) => index !== known && turn.at > mark.writtenAt);
}

export function withUnlogged(
  summary: LogSummary,
  turns: TranscriptTurn[],
  settled: boolean
): LogSummary {
  const [first] = turns;
  const last = turns.at(-1);
  if (!first || !last) return summary;
  const prompt = turns.findLast((turn) => transcriptNotice(turn.content) === null);
  return {
    ...summary,
    title: summary.requestCount === 0 ? titleText(first.content) : summary.title,
    updatedAt: Math.max(summary.updatedAt, last.at),
    status: settled ? 'idle' : 'running',
    lastRequestState: settled ? 'complete' : 'pending',
    requestCount: summary.requestCount + turns.length,
    preview: (prompt && previewText(prompt.content)) ?? summary.preview
  };
}

export function pendingTurns(
  turns: TranscriptTurn[],
  modelId: string | null,
  statuses: ReadonlyMap<string, ToolStatus>,
  settled: boolean
): RequestView[] {
  const last = turns.at(-1);
  return turns.map((turn) => ({
    id: turn.id,
    timestamp: turn.at,
    message: turn.content,
    notice: transcriptNotice(turn.content),
    modelId,
    agentName: null,
    state: turn === last && !settled ? 'pending' : 'complete',
    error: null,
    editable: false,
    disabled: false,
    editedPaths: [],
    images: [],
    parts: activityParts(turn.events, statuses, false)
  }));
}
