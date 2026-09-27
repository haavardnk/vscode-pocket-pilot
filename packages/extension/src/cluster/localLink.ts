import type { Hub, WindowLink } from './hub';
import type { Disposable, LocalWindow } from './localWindow';

export function attachLocalWindow(hub: Hub, window: LocalWindow): Disposable {
  const link: WindowLink = {
    watch: (sessions) => window.setWatches(sessions),
    watchTerminals: (terminalIds) => window.setTerminalWatches(terminalIds),
    run: (command) => window.run(command),
    query: (query) => window.query(query),
    hook: (event) => window.hook(event)
  };
  hub.addWindow(window.state(), link);
  const subscriptions = [
    window.onDidChangeState((state) => hub.updateWindow(state)),
    window.onDidChangeSession(({ sessionId, detail }) =>
      hub.sessionUpdate(window.windowId, sessionId, detail)
    ),
    window.onDidChangeTerminal((update) => {
      if ('patch' in update) hub.terminalPatch(window.windowId, update.terminalId, update.patch);
      else hub.terminalUpdate(window.windowId, update.terminalId, update.detail);
    })
  ];
  return {
    dispose: () => {
      for (const subscription of subscriptions) subscription.dispose();
      window.setWatches([]);
      window.setTerminalWatches([]);
      hub.removeWindow(window.windowId, link);
    }
  };
}
