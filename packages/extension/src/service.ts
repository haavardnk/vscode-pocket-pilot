import type { FSWatcher } from 'chokidar';
import * as vscode from 'vscode';

import { githubToken } from './auth/github';
import type { PasswordSecret } from './auth/passwordSecret';
import type { TunnelSecret } from './auth/tunnelSecret';
import { Cluster, type Role } from './cluster/cluster';
import { followLeader } from './cluster/followerClient';
import { type Leader, startLeader } from './cluster/leader';
import { sharedFiles } from './cluster/sharedState';
import { errorMessage } from './errors';
import { readSettings, type Settings } from './settings';
import { type TunnelStatus, watchTunnelStatus } from './tunnel/status';
import type { TunnelSettings } from './tunnel/tunnel';
import { WindowAgent } from './windowAgent';

export class PocketPilotService {
  private readonly roleChanged = new vscode.EventEmitter<Role>();
  private readonly tunnelChanged = new vscode.EventEmitter<TunnelStatus | null>();
  private window: WindowAgent | null = null;
  private cluster: Cluster<Leader> | null = null;
  private tunnelWatcher: FSWatcher | null = null;
  private settings: Settings = readSettings();
  private queue: Promise<void> = Promise.resolve();
  private current: Role = { kind: 'stopped' };
  private tunnelStatus: TunnelStatus | null = null;

  readonly onDidChangeRole = this.roleChanged.event;
  readonly onDidChangeTunnel = this.tunnelChanged.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly password: PasswordSecret,
    private readonly tunnelSecret: TunnelSecret,
    private readonly log: vscode.LogOutputChannel
  ) {}

  get role(): Role {
    return this.current;
  }

  get tunnel(): TunnelStatus | null {
    return this.tunnelStatus;
  }

  get storage(): string {
    return this.context.globalStorageUri.fsPath;
  }

  phoneUrl(): string | null {
    return this.tunnelStatus?.state === 'ready' ? this.tunnelStatus.url : null;
  }

  start(): Promise<void> {
    return this.enqueue(() => this.startNow());
  }

  stop(): Promise<void> {
    return this.enqueue(() => this.stopNow());
  }

  restart(): Promise<void> {
    return this.enqueue(async () => {
      await this.stopNow();
      await this.startNow();
    });
  }

  refreshPullRequests(): void {
    this.cluster?.leader?.refreshPullRequests();
  }

  settingsChanged(): Promise<void> {
    const previous = this.settings;
    this.settings = readSettings();
    if (!this.settings.enabled) return this.stop();
    if (!previous.enabled || !this.cluster) return this.start();
    if (
      previous.port !== this.settings.port ||
      previous.cloudflaredPath !== this.settings.cloudflaredPath
    )
      return this.restart();
    this.refreshPullRequests();
    return Promise.resolve();
  }

  tunnelSecretChanged(): Promise<void> {
    return this.current.kind === 'leader' ? this.restart() : Promise.resolve();
  }

  async shutdown(): Promise<void> {
    await this.stop();
    this.roleChanged.dispose();
    this.tunnelChanged.dispose();
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(task, task);
    return this.queue;
  }

  private async startNow(): Promise<void> {
    if (this.cluster) return;
    this.settings = readSettings();
    const report = (message: string): void => this.log.info(message);
    const window = new WindowAgent(this.context, report);
    await window.start();
    const { port } = this.settings;
    const version = String(
      (this.context.extension.packageJSON as { version?: unknown }).version ?? '0.0.0'
    );
    const cluster = new Cluster<Leader>({
      lead: async () =>
        startLeader({
          window,
          storage: this.storage,
          port,
          tunnel: await this.tunnelSettings(),
          version,
          webRoot: this.context.asAbsolutePath('media/web'),
          password: this.password,
          expireDays: () => readSettings().expireDays,
          pullRequests: {
            enabled: () => readSettings().pullRequestsEnabled,
            intervalMs: () => readSettings().pollSeconds * 1000,
            token: githubToken
          },
          report
        }),
      follow: () => followLeader(window, this.storage, port, report),
      portInUse: `Port ${port} is used by another program`,
      onRole: (role) => {
        this.current = role;
        if (role.kind === 'leader') this.log.info('Serving phones through the Cloudflare tunnel');
        if (role.kind === 'follower') this.log.info('Connected to the Pocket Pilot leader window');
        this.roleChanged.fire(role);
      },
      report
    });
    const tunnelWatcher = watchTunnelStatus(
      sharedFiles(this.storage).tunnel,
      (status) => {
        if (this.tunnelWatcher === tunnelWatcher) this.setTunnelStatus(status);
      },
      (error) => this.log.warn(`Tunnel status watcher failed: ${errorMessage(error)}`)
    );
    this.window = window;
    this.cluster = cluster;
    this.tunnelWatcher = tunnelWatcher;
    cluster.start();
  }

  private async stopNow(): Promise<void> {
    const cluster = this.cluster;
    const window = this.window;
    const tunnelWatcher = this.tunnelWatcher;
    this.cluster = null;
    this.window = null;
    this.tunnelWatcher = null;
    await tunnelWatcher?.close();
    this.setTunnelStatus(null);
    await cluster?.stop();
    window?.dispose();
  }

  private setTunnelStatus(status: TunnelStatus | null): void {
    if (JSON.stringify(status) === JSON.stringify(this.tunnelStatus)) return;
    this.tunnelStatus = status;
    this.tunnelChanged.fire(status);
  }

  private async tunnelSettings(): Promise<TunnelSettings> {
    return {
      named: await this.tunnelSecret.get(),
      cloudflaredPath: readSettings().cloudflaredPath
    };
  }
}
