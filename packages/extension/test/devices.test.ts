import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DeviceStore } from '../src/server/devices';

describe('device store', () => {
  it('keeps valid devices when one entry is corrupt', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'pocket-pilot-devices-'));
    const file = join(folder, 'devices.json');
    const now = Date.now();
    const valid = { id: 'a', name: 'Phone', tokenHash: 'h', pairedAt: now, lastSeenAt: now };
    const corrupt = { ...valid, id: 'b', pairedAt: new Date(now).toISOString() };
    await writeFile(file, JSON.stringify([valid, corrupt]));
    const devices = await new DeviceStore(file, () => 30).list();
    await rm(folder, { recursive: true, force: true });
    expect(devices.map((device) => device.id)).toEqual(['a']);
  });
});
