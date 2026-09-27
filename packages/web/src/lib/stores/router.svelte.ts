import { parseRoute, type Route, routeHash } from '../routing';

class RouterStore {
  route = $state<Route>(parseRoute(location.hash));

  constructor() {
    addEventListener('hashchange', () => {
      this.route = parseRoute(location.hash);
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
    history.replaceState(null, '', `${location.pathname}${location.search}${routeHash(route)}`);
    this.route = route;
  }
}

export const router = new RouterStore();
