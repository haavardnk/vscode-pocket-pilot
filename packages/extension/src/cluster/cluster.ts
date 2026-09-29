import { errorMessage } from '../errors';

const MIN_RETRY_MS = 100;
const RETRY_JITTER_MS = 500;
const MAX_BACKOFF_MS = 10_000;
const FAILURES_BEFORE_ERROR = 3;

export type Role =
  | { kind: 'stopped' }
  | { kind: 'starting' }
  | { kind: 'leader' }
  | { kind: 'follower' }
  | { kind: 'error'; message: string };

export interface LeaderHandle {
  close(keepTunnel?: boolean): Promise<void>;
}

export interface FollowerHandle {
  closed: Promise<void>;
  close(): void;
}

export interface ClusterOptions<L extends LeaderHandle> {
  lead: () => Promise<L>;
  follow: () => Promise<FollowerHandle>;
  portInUse: string;
  onRole: (role: Role) => void;
  report: (message: string) => void;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(failures: number): number {
  const backoff = failures === 0 ? 0 : Math.min(MAX_BACKOFF_MS, 500 * 2 ** (failures - 1));
  return MIN_RETRY_MS + Math.random() * RETRY_JITTER_MS + backoff;
}

export class Cluster<L extends LeaderHandle> {
  private generation = 0;
  private leaderHandle: L | null = null;
  private followerHandle: FollowerHandle | null = null;
  private current: Role = { kind: 'stopped' };

  constructor(private readonly options: ClusterOptions<L>) {}

  get role(): Role {
    return this.current;
  }

  get leader(): L | null {
    return this.leaderHandle;
  }

  start(): void {
    if (this.current.kind !== 'stopped') return;
    this.generation += 1;
    this.setRole({ kind: 'starting' });
    void this.run(this.generation);
  }

  async stop(keepTunnel = false): Promise<void> {
    this.generation += 1;
    const leader = this.leaderHandle;
    this.leaderHandle = null;
    this.followerHandle?.close();
    this.followerHandle = null;
    this.setRole({ kind: 'stopped' });
    await leader?.close(keepTunnel);
  }

  private async run(generation: number): Promise<void> {
    let failures = 0;
    while (generation === this.generation) {
      const leader = await this.tryLead(generation, failures);
      if (leader === 'stale') return;
      if (leader) {
        this.leaderHandle = leader;
        this.setRole({ kind: 'leader' });
        return;
      }
      const follower = await this.options.follow().catch((error: unknown) => errorMessage(error));
      if (generation !== this.generation) {
        if (typeof follower !== 'string') follower.close();
        return;
      }
      if (typeof follower === 'string') {
        failures += 1;
        if (failures >= FAILURES_BEFORE_ERROR) {
          this.fail(`${this.options.portInUse} (${follower})`, failures === FAILURES_BEFORE_ERROR);
        }
      } else {
        failures = 0;
        this.followerHandle = follower;
        this.setRole({ kind: 'follower' });
        await follower.closed;
        if (generation !== this.generation) return;
        this.followerHandle = null;
        this.setRole({ kind: 'starting' });
      }
      await delay(retryDelay(failures));
    }
  }

  private async tryLead(generation: number, failures: number): Promise<L | null | 'stale'> {
    try {
      const leader = await this.options.lead();
      if (generation === this.generation) return leader;
      await leader.close();
      return 'stale';
    } catch (error) {
      if (generation !== this.generation) return 'stale';
      if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') return null;
      this.fail(`Could not start the server: ${errorMessage(error)}`, failures === 0);
      await delay(retryDelay(failures + 1));
      if (generation !== this.generation) return 'stale';
      return this.tryLead(generation, failures + 1);
    }
  }

  private fail(message: string, log: boolean): void {
    if (log) this.options.report(message);
    this.setRole({ kind: 'error', message });
  }

  private setRole(role: Role): void {
    this.current = role;
    this.options.onRole(role);
  }
}
