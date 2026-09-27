import { mkdir, readFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

import { errorMessage } from '../errors';

const MIN_DELAY_MS = 300;
const MAX_DELAY_MS = 3000;
const COST_FACTOR = 8;
const BACKOFF = 1.5;
const WARM_MS = 10_000;

export interface MirrorSources {
  file: string;
  exportTo: (file: string) => Promise<void>;
  active: () => boolean;
  apply: (root: unknown, at: number) => void;
  report: (message: string) => void;
}

export class LiveMirror {
  private timer: NodeJS.Timeout | undefined;
  private ticking = false;
  private poked = false;
  private enabled = false;
  private warmUntil = 0;
  private delay = MIN_DELAY_MS;
  private previous: string | null = null;

  constructor(private readonly sources: MirrorSources) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) this.wake();
    else this.halt();
  }

  poke(): void {
    this.warmUntil = Date.now() + WARM_MS;
    this.delay = MIN_DELAY_MS;
    if (this.ticking) this.poked = true;
    else this.schedule(0);
  }

  wake(): void {
    if (this.timer === undefined && !this.ticking) this.schedule(0);
  }

  dispose(): void {
    this.enabled = false;
    this.halt();
  }

  private halt(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.previous = null;
  }

  private wanted(): boolean {
    return this.enabled && (Date.now() < this.warmUntil || this.sources.active());
  }

  private schedule(delay: number): void {
    if (!this.wanted() || this.ticking) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.tick();
    }, delay);
  }

  private async tick(): Promise<void> {
    if (!this.wanted()) {
      this.previous = null;
      return;
    }
    this.ticking = true;
    const started = Date.now();
    try {
      const text = await this.capture();
      if (text !== null && text !== this.previous) {
        this.previous = text;
        this.sources.apply(JSON.parse(text), started);
        this.delay = Math.min(
          MAX_DELAY_MS,
          Math.max(MIN_DELAY_MS, (Date.now() - started) * COST_FACTOR)
        );
      } else {
        this.delay = Math.min(MAX_DELAY_MS, this.delay * BACKOFF);
      }
    } catch (error) {
      this.sources.report(`Live chat export failed: ${errorMessage(error)}`);
      this.delay = MAX_DELAY_MS;
    } finally {
      this.ticking = false;
    }
    this.schedule(this.poked ? 0 : this.delay);
    this.poked = false;
  }

  private async capture(): Promise<string | null> {
    const { file } = this.sources;
    await mkdir(dirname(file), { recursive: true });
    await rm(file, { force: true });
    await this.sources.exportTo(file);
    return readFile(file, 'utf8').catch(() => null);
  }
}
