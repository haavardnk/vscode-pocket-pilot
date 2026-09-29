import { describe, expect, it } from 'vitest';

import { DetailFeed, type SessionUpdate } from '../src/sessions/detailFeed';

function feed(): { feed: DetailFeed; loads: string[]; updates: SessionUpdate[] } {
  const loads: string[] = [];
  const updates: SessionUpdate[] = [];
  const detailFeed = new DetailFeed(
    async (sessionId, limit) => {
      loads.push(`${sessionId}:${limit}`);
      await Promise.resolve();
      return null;
    },
    (update) => updates.push(update),
    () => undefined
  );
  return { feed: detailFeed, loads, updates };
}

async function settle(): Promise<void> {
  for (let tick = 0; tick < 10; tick++) await Promise.resolve();
}

describe('DetailFeed', () => {
  it('pushes only watches whose limit changed', async () => {
    const { feed: detailFeed, loads, updates } = feed();
    detailFeed.setWatches([{ sessionId: 'a', limit: 5 }]);
    detailFeed.setWatches([
      { sessionId: 'a', limit: 5 },
      { sessionId: 'b', limit: 2 }
    ]);
    await settle();
    expect(loads).toEqual(['a:5', 'b:2']);
    expect(updates.map((update) => update.sessionId)).toEqual(['a', 'b']);
  });

  it('skips sessions that are no longer watched', async () => {
    const { feed: detailFeed, updates } = feed();
    detailFeed.setWatches([{ sessionId: 'a', limit: 5 }]);
    detailFeed.setWatches([]);
    await settle();
    expect(updates).toEqual([]);
    detailFeed.pushWatched('a');
    await settle();
    expect(updates).toEqual([]);
  });
});
