import { parseRoute, type Route, routeHash, type Tab, tabOf } from '../routing';

class RouterStore {
  route = $state<Route>(parseRoute(location.hash));
  tab = $derived(tabOf(this.route));
  routes = $state.raw<Partial<Record<Tab, Route>>>({ [tabOf(this.route)]: this.route });

  constructor() {
    addEventListener('hashchange', () => {
      this.show(parseRoute(location.hash));
    });
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.addEventListener('message', (event: MessageEvent<unknown>) => {
      const data = event.data as { type?: unknown; hash?: unknown } | null;
      if (data?.type === 'navigate' && typeof data.hash === 'string') location.hash = data.hash;
    });
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
}

export const router = new RouterStore();
