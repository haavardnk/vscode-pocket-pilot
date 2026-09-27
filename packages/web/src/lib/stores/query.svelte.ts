export class QueryResource<T> {
  value = $state.raw<T | null>(null);
  error = $state<string | null>(null);
  loading = $state(false);
  private version = 0;

  constructor(private readonly load: () => Promise<T>) {}

  async refresh(): Promise<void> {
    this.version += 1;
    const version = this.version;
    this.loading = true;
    try {
      const value = await this.load();
      if (version !== this.version) return;
      this.value = value;
      this.error = null;
    } catch (error) {
      if (version !== this.version) return;
      this.error = error instanceof Error ? error.message : String(error);
    }
    this.loading = false;
  }
}
