const WINDOW_MS = 24 * 60 * 60_000;
const MAX_FAILURES = 30;

export type LoginOutcome = 'ok' | 'wrong' | 'blocked';

export class LoginLimit {
  private failures: number[] = [];
  private checking: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly report: (message: string) => void,
    private readonly now: () => number = Date.now
  ) {}

  attempt(verify: () => Promise<boolean>): Promise<LoginOutcome> {
    const result = this.checking.then(() => this.check(verify));
    this.checking = result.catch(() => undefined);
    return result;
  }

  private async check(verify: () => Promise<boolean>): Promise<LoginOutcome> {
    const since = this.now() - WINDOW_MS;
    this.failures = this.failures.filter((at) => at > since);
    if (this.failures.length >= MAX_FAILURES) return 'blocked';
    if (await verify()) return 'ok';
    this.failures.push(this.now());
    if (this.failures.length === MAX_FAILURES) {
      this.report(
        `Password sign-in is paused after ${MAX_FAILURES} wrong passwords in a day. Phones can still pair with a code.`
      );
    }
    return 'wrong';
  }
}
