const WRAP_KEY = 'pocket-pilot-wrap';

class CodeViewStore {
  wrap = $state(localStorage.getItem(WRAP_KEY) === 'on');

  toggleWrap(): void {
    this.wrap = !this.wrap;
    localStorage.setItem(WRAP_KEY, this.wrap ? 'on' : 'off');
  }
}

export const codeView = new CodeViewStore();
