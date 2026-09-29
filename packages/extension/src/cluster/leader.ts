import { basename } from 'node:path';

import { errorMessage } from '../errors';
import { watchTargets } from '../fsWatch';
import { PushService } from '../push/pushService';
import { PushStore } from '../push/pushStore';
import { StatusWatcher } from '../push/statusWatcher';
import { vapidKeys } from '../push/vapid';
import { type PasswordCheck, startServer } from '../server/app';
import { DeviceStore } from '../server/devices';
import { PairingStore } from '../server/pairing';
import { PhoneRegistry } from '../server/phones';
import { startTunnel, type TunnelSettings } from '../tunnel/tunnel';
import { Hub } from './hub';
import { attachLocalWindow } from './localLink';
import type { LocalWindow } from './localWindow';
import { clusterSecret, hookSecret, sharedFiles } from './sharedState';

export interface LeaderOptions {
  window: LocalWindow;
  storage: string;
  port: number;
  tunnel: TunnelSettings;
  keeperScript: string;
  version: string;
  webRoot: string;
  password: PasswordCheck;
  expireDays: () => number;
  report: (message: string) => void;
}

export interface Leader {
  close(keepTunnel?: boolean): Promise<void>;
}

export async function startLeader(options: LeaderOptions): Promise<Leader> {
  const { report } = options;
  const files = sharedFiles(options.storage);
  const secret = await clusterSecret(options.storage);
  const devices = new DeviceStore(files.devices, options.expireDays);
  const phones = new PhoneRegistry();
  const push = new PushService({
    store: new PushStore(files.push),
    keys: await vapidKeys(files.vapid),
    activeDevices: async () => new Set((await devices.list()).map((device) => device.id)),
    visible: (deviceId) => phones.visible(deviceId),
    report
  });
  const alerts = new StatusWatcher((alert) => {
    push
      .notify(alert)
      .catch((error: unknown) => report(`Push notifications failed: ${errorMessage(error)}`));
  });

  const hub: Hub = new Hub(options.version, {
    windowsChanged: () => alerts.observe(hub.windowStates())
  });

  const server = await startServer({
    port: options.port,
    namedTunnel: !!options.tunnel.named,
    webRoot: options.webRoot,
    clusterSecret: secret,
    hookSecret: await hookSecret(options.storage),
    hub,
    devices,
    pairing: new PairingStore(files.pairing),
    phones,
    push,
    password: options.password,
    expireDays: options.expireDays,
    report
  });

  const local = attachLocalWindow(hub, options.window);
  const tunnel = await startTunnel({
    ...options.tunnel,
    origin: server.tunnel,
    leaderPort: options.port,
    keeperScript: options.keeperScript,
    version: options.version,
    storage: options.storage,
    statusFile: files.tunnel,
    report
  });
  const watcher = watchTargets(
    [{ path: options.storage, depth: 0 }],
    (_event, file) => {
      if (basename(file) === basename(files.devices)) void server.revokeMissing();
    },
    (error) => report(`Device watcher failed: ${errorMessage(error)}`),
    () => void server.revokeMissing()
  );

  return {
    close: async (keepTunnel = false) => {
      local.dispose();
      alerts.dispose();
      await watcher.close();
      await tunnel.close(keepTunnel);
      await server.close();
    }
  };
}
