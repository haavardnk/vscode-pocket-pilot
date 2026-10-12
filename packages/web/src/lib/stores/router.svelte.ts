import { takeTarget } from '../notificationTarget';
import { parseRoute, type Route, routeHash, type Tab, tabOf } from '../routing';

const CLAIM_MS = 5000;
const CLAIM_POLL_MS = 200;

class RouterStore {
  route = $state<Route>(parseRoute(location.hash));
  tab = $derived(tabOf(this.route));
  routes = $state.raw<Partial<Record<Tab, Route>>>({ [tabOf(this.route)]: this.route });
  private claim = 0;

  constructor() {
    addEventListener('hashchange', () => {
      this.show(parseRoute(location.hash));
    });
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.addEventListener('message', (event: MessageEvent<unknown>) => {
      const data = event.data as { type?: unknown; hash?: unknown } | null;
      if (data?.type !== 'navigate' || typeof data.hash !== 'string') return;
      this.claim++;
      void takeTarget();
      location.hash = data.hash;
    });
    document.addEventListener('visibilitychange', () => this.claimTarget());
    this.claimTarget();
  }

  go(route: Route): void {
    location.hash = routeHash(route);
  }

  replace(route: Route): void {
    const tab = tabOf(route);
    if (tab !== this.tab) {
      this.routes = { ...this.routes, [tab]: route };
      return;
    }
    history.replaceState(null, '', `${location.pathname}${location.search}${routeHash(route)}`);
    this.show(route);
  }

  openTab(tab: Tab): void {
    this.go(tab === this.tab ? { name: tab } : (this.routes[tab] ?? { name: tab }));
  }

  private show(route: Route): void {
    const tab = tabOf(route);
    const shown = this.routes[tab];
    if (shown && routeHash(shown) === routeHash(route)) {
      this.route = shown;
      return;
    }
    this.route = route;
    this.routes = { ...this.routes, [tab]: route };
  }

  private claimTarget(): void {
    if (document.visibilityState !== 'visible') return;
    const claim = ++this.claim;
    const deadline = Date.now() + CLAIM_MS;
    const attempt = async (): Promise<void> => {
      if (claim !== this.claim) return;
      const hash = await takeTarget();
      if (hash !== null) {
        location.hash = hash;
        return;
      }
      if (Date.now() < deadline && document.visibilityState === 'visible')
        setTimeout(() => void attempt(), CLAIM_POLL_MS);
    };
    void attempt();
  }
}

export const router = new RouterStore();
