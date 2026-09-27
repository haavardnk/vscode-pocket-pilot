import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

import { createOnce } from '../storage/sharedFile';

export const LOOPBACK = '127.0.0.1';

export interface SharedFiles {
  devices: string;
  pairing: string;
  tunnel: string;
  push: string;
  vapid: string;
}

export function sharedFiles(storage: string): SharedFiles {
  return {
    devices: join(storage, 'devices.json'),
    pairing: join(storage, 'pairing.json'),
    tunnel: join(storage, 'tunnel.json'),
    push: join(storage, 'push.json'),
    vapid: join(storage, 'vapid.json')
  };
}

export function clusterSecret(storage: string): Promise<string> {
  return createOnce(join(storage, 'cluster-secret'), () => randomBytes(32).toString('base64url'));
}
