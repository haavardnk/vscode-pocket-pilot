import type { ResponsePart, SessionDetail } from '@pocket-pilot/protocol';

import type { EditingSessions } from '../sessions/editingState';
import type { LiveEdit, LiveEdits } from '../sessions/liveEdits';
import { stopEdit, type Timeline } from '../sessions/timeline';
import { diffBlobs, type DiffCounts, diffCounts, UNKNOWN_COUNTS } from './diff';
import { textBlob } from './files';

const MAX_CACHED = 2000;

export interface EditTarget {
  requestId: string;
  path: string;
  stopId: string | null;
  callId: string | null;
}

type TimelineLoader = () => Promise<Timeline>;

function cacheKey(sessionId: string, target: EditTarget): string {
  return [sessionId, target.requestId, target.stopId, target.callId, target.path].join('\0');
}

export class EditChanges {
  private readonly counts = new Map<string, DiffCounts>();

  constructor(
    private readonly editing: EditingSessions,
    private readonly live: LiveEdits
  ) {}

  async resolve(
    sessionId: string,
    target: EditTarget,
    timeline: TimelineLoader = () => this.editing.timeline(sessionId)
  ): Promise<LiveEdit | null> {
    const logged =
      target.stopId === null
        ? null
        : stopEdit(await timeline(), target.requestId, target.stopId, target.path);
    const saved = logged && {
      before: textBlob(logged.before),
      after: textBlob(logged.after),
      final: logged.final
    };
    if (saved?.final) return saved;
    const live =
      target.callId === null ? null : await this.live.edit(sessionId, target.callId, target.path);
    return live ?? saved;
  }

  async decorate(detail: SessionDetail): Promise<SessionDetail> {
    let timeline: Promise<Timeline> | null = null;
    const load: TimelineLoader = () => (timeline ??= this.editing.timeline(detail.id));
    const requests = await Promise.all(
      detail.requests.map(async (request) => ({
        ...request,
        parts: await Promise.all(
          request.parts.map(async (part): Promise<ResponsePart> => {
            if (part.kind !== 'edit') return part;
            const target = { requestId: request.id, ...part };
            return { ...part, ...(await this.count(detail.id, target, load)) };
          })
        )
      }))
    );
    return { ...detail, requests };
  }

  private async count(
    sessionId: string,
    target: EditTarget,
    timeline: TimelineLoader
  ): Promise<DiffCounts> {
    if (target.stopId === null && target.callId === null) return UNKNOWN_COUNTS;
    const key = cacheKey(sessionId, target);
    const cached = this.counts.get(key);
    if (cached) return cached;
    const edit = await this.resolve(sessionId, target, timeline);
    if (!edit) return UNKNOWN_COUNTS;
    const counts = diffCounts(diffBlobs(edit.before, edit.after));
    if (!edit.final) return counts;
    this.counts.set(key, counts);
    const [oldest] = this.counts.keys();
    if (this.counts.size > MAX_CACHED && oldest !== undefined) this.counts.delete(oldest);
    return counts;
  }
}
