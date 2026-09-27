import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';

import type { Device } from '@pocket-pilot/protocol';
import { z } from 'zod';

import { parseJson } from '../json';
import { readOptional, writeAtomic } from '../storage/sharedFile';

const DAY_MS = 86_400_000;
const SEEN_WRITE_INTERVAL_MS = 3_600_000;

const storedDeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  tokenHash: z.string(),
  pairedAt: z.number(),
  lastSeenAt: z.number()
});

type StoredDevice = z.infer<typeof storedDeviceSchema>;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function publicDevice({ tokenHash: _, ...device }: StoredDevice): Device {
  return device;
}

function parseDevices(text: string): StoredDevice[] {
  const entries = parseJson(text);
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry: unknown) => {
    const result = storedDeviceSchema.safeParse(entry);
    return result.success ? [result.data] : [];
  });
}

export class DeviceStore {
  private cache: { version: string; devices: StoredDevice[] } | null = null;

  constructor(
    private readonly file: string,
    private readonly expireDays: () => number
  ) {}

  async list(): Promise<Device[]> {
    return (await this.read()).map(publicDevice);
  }

  async add(name: string): Promise<{ device: Device; token: string }> {
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    const device: StoredDevice = {
      id: randomUUID(),
      name,
      tokenHash: hashToken(token),
      pairedAt: now,
      lastSeenAt: now
    };
    await this.write([...(await this.read()), device]);
    return { device: publicDevice(device), token };
  }

  async authenticate(token: string): Promise<Device | null> {
    const tokenHash = hashToken(token);
    const devices = await this.read();
    const device = devices.find((item) => item.tokenHash === tokenHash);
    if (!device) return null;
    const now = Date.now();
    if (now - device.lastSeenAt >= SEEN_WRITE_INTERVAL_MS) {
      await this.write(
        devices.map((item) => (item.id === device.id ? { ...item, lastSeenAt: now } : item))
      );
    }
    return publicDevice({ ...device, lastSeenAt: now });
  }

  async remove(ids: readonly string[]): Promise<void> {
    const devices = await this.read();
    const kept = devices.filter((device) => !ids.includes(device.id));
    if (kept.length !== devices.length) await this.write(kept);
  }

  private async read(): Promise<StoredDevice[]> {
    const version = await stat(this.file).then(
      (info) => `${info.mtimeMs}:${info.size}`,
      () => null
    );
    const devices =
      version !== null && this.cache?.version === version
        ? this.cache.devices
        : await this.load(version);
    const days = this.expireDays();
    const cutoff = days > 0 ? Date.now() - days * DAY_MS : -Infinity;
    const active = devices.filter((device) => device.lastSeenAt >= cutoff);
    if (active.length !== devices.length) await this.write(active);
    return active;
  }

  private async load(version: string | null): Promise<StoredDevice[]> {
    const text = version === null ? null : await readOptional(this.file);
    const devices = text === null ? [] : parseDevices(text);
    this.cache = version === null ? null : { version, devices };
    return devices;
  }

  private async write(devices: StoredDevice[]): Promise<void> {
    await writeAtomic(this.file, `${JSON.stringify(devices, null, 2)}\n`);
    this.cache = null;
  }
}
