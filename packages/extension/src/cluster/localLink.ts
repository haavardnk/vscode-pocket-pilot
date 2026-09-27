import type { Hub, WindowLink } from './hub';
import type { Disposable, LocalWindow } from './localWindow';

export function attachLocalWindow(hub: Hub, window: LocalWindow): Disposable {
  const link: WindowLink = {
    watch: (sessions) => window.setWatches(sessions),
    run: (command) => window.run(command),
    query: (query) => window.query(query),
    hook: (event) => window.hook(event)
  };
  hub.addWindow(window.state(), link);
  const subscriptions = [
    window.onDidChangeState((state) => hub.updateWindow(state)),
    window.onDidChangeSession(({ sessionId, detail }) =>
      hub.sessionUpdate(window.windowId, sessionId, detail)
    )
  ];
  return {
    dispose: () => {
      for (const subscription of subscriptions) subscription.dispose();
      window.setWatches([]);
      hub.removeWindow(window.windowId, link);
    }
  };
}
