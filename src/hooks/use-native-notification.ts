import { useEffect } from 'react';
import useTabStore from '@/hooks/use-tab-store';
import useConfigStore from '@/hooks/use-config-store';
import { navigateToTab } from '@/hooks/use-layout';
import isElectron from '@/hooks/use-is-electron';
import { registerNotificationShortcutTarget } from '@/lib/notification-shortcut';

interface INativeNotificationTarget {
  workspaceId: string;
  tabId: string;
}

interface IElectronAPI {
  showNotification: (
    title: string,
    body: string,
    target: INativeNotificationTarget,
  ) => Promise<string | null>;
  openNotification: (notificationId: string) => Promise<boolean>;
  setDockBadge: (count: number) => Promise<void>;
  onNotificationClick: (callback: (target: INativeNotificationTarget) => void) => () => void;
  onNotificationClosed: (callback: (notificationId: string) => void) => () => void;
}

const getElectronAPI = (): IElectronAPI | null => {
  if (!isElectron) return null;
  return (window as unknown as { electronAPI: IElectronAPI }).electronAPI;
};

const useNativeNotification = () => {
  useEffect(() => {
    const api = getElectronAPI();
    if (!api) return;

    const shortcutCleanups = new Map<string, () => void>();
    const closedBeforeRegistration = new Set<string>();
    let disposed = false;

    const clearShortcut = (notificationId: string) => {
      const cleanup = shortcutCleanups.get(notificationId);
      if (!cleanup) {
        closedBeforeRegistration.add(notificationId);
        return;
      }
      shortcutCleanups.delete(notificationId);
      cleanup();
    };

    const unsubClick = api.onNotificationClick(({ workspaceId, tabId }) => {
      navigateToTab(workspaceId, tabId);
    });
    const unsubClosed = api.onNotificationClosed(clearShortcut);

    const showNotification = (
      title: string,
      body: string,
      target: INativeNotificationTarget,
    ) => {
      void api.showNotification(title, body, target).then((notificationId) => {
        if (!notificationId || disposed) return;
        if (closedBeforeRegistration.delete(notificationId)) return;

        const cleanup = registerNotificationShortcutTarget({
          id: `native:${notificationId}`,
          open: () => api.openNotification(notificationId).then(() => undefined),
        });
        shortcutCleanups.set(notificationId, cleanup);
      });
    };

    const unsubStore = useTabStore.subscribe((state, prev) => {
      const enabled = useConfigStore.getState().notificationsEnabled;
      let notified = false;
      let attentionCount = 0;

      for (const [tabId, tab] of Object.entries(state.tabs)) {
        if (tab.cliState === 'ready-for-review' || tab.cliState === 'needs-input') attentionCount++;

        if (notified || !enabled) continue;
        const prevTab = prev.tabs[tabId];
        if (!prevTab || prevTab.cliState === tab.cliState) continue;
        const body = tab.lastUserMessage
          ? tab.lastUserMessage.slice(0, 100)
          : tab.tabName || tabId;
        const target = { workspaceId: tab.workspaceId, tabId };
        if (tab.cliState === 'ready-for-review') {
          showNotification('Task Complete', body, target);
          notified = true;
        } else if (tab.cliState === 'needs-input') {
          showNotification('Input Required', body, target);
          notified = true;
        }
      }

      api.setDockBadge(attentionCount);
    });

    return () => {
      disposed = true;
      unsubClick();
      unsubClosed();
      unsubStore();
      for (const cleanup of shortcutCleanups.values()) cleanup();
      shortcutCleanups.clear();
    };
  }, []);
};

export default useNativeNotification;
