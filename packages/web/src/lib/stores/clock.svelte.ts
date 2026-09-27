class ClockStore {
  now = $state(Date.now());

  constructor() {
    setInterval(() => {
      this.now = Date.now();
    }, 30_000);
  }
}

export const clock = new ClockStore();
