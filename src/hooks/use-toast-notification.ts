import { useEffect } from 'react';
import Router from 'next/router';
import { toast } from 'sonner';
import { t } from '@/lib/i18n';
import useTabStore from '@/hooks/use-tab-store';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import useConfigStore from '@/hooks/use-config-store';
import { navigateToTab, useLayoutStore } from '@/hooks/use-layout';
import { findPane } from '@/lib/layout-tree';
import { registerNotificationShortcutTarget } from '@/lib/notification-shortcut';

const truncate = (s: string, n: number): string =>
  s.length <= n ? s : s.slice(0, n).trimEnd() + '…';

const getFocusedTabId = (): string | null => {
  if (Router.router?.pathname !== '/') return null;
  const layout = useLayoutStore.getState().layout;
  if (!layout?.activePaneId) return null;
  const pane = findPane(layout.root, layout.activePaneId);
  return pane?.activeTabId ?? null;
};

const toastIdFor = (tabId: string) => `tab-complete:${tabId}`;

const useToastNotification = () => {
  useEffect(() => {
    const shortcutCleanups = new Map<string, () => void>();

    const clearToastShortcut = (toastId: string) => {
      const cleanup = shortcutCleanups.get(toastId);
      if (!cleanup) return;
      shortcutCleanups.delete(toastId);
      cleanup();
    };

    const unsubTabs = useTabStore.subscribe((state, prev) => {
      const { toastOnCompleteEnabled, toastDuration } = useConfigStore.getState();
      if (!toastOnCompleteEnabled) return;
      if (typeof document === 'undefined' || document.hidden) return;

      let focusedTabId: string | null | undefined;

      for (const [tabId, tab] of Object.entries(state.tabs)) {
        const prevTab = prev.tabs[tabId];
        if (!prevTab) continue;
        if (prevTab.cliState === tab.cliState) continue;
        if (tab.cliState !== 'ready-for-review') continue;
        if (focusedTabId === undefined) focusedTabId = getFocusedTabId();
        if (tabId === focusedTabId) continue;

        const wsName = useWorkspaceStore.getState().workspaces.find((w) => w.id === tab.workspaceId)?.name
          ?? tab.workspaceId;
        const body = tab.lastUserMessage ? truncate(tab.lastUserMessage, 120) : (tab.tabName || tabId);
        const workspaceId = tab.workspaceId;
        const title = `${t('notification', 'toastCompleteTitle')} · ${wsName}`;
        const toastId = toastIdFor(tabId);

        clearToastShortcut(toastId);
        let unregisterShortcut = () => {};
        const clearShortcut = () => {
          if (shortcutCleanups.get(toastId) !== unregisterShortcut) return;
          shortcutCleanups.delete(toastId);
          unregisterShortcut();
        };
        const openTab = () => {
          clearShortcut();
          toast.dismiss(toastId);
          navigateToTab(workspaceId, tabId);
        };
        unregisterShortcut = registerNotificationShortcutTarget({
          id: `toast:${toastId}`,
          open: openTab,
        });
        shortcutCleanups.set(toastId, unregisterShortcut);

        toast.success(title, {
          id: toastId,
          description: body,
          duration: toastDuration,
          classNames: {
            description: 'line-clamp-2',
          },
          action: {
            label: t('notification', 'openTab'),
            onClick: openTab,
          },
          onDismiss: clearShortcut,
          onAutoClose: clearShortcut,
        });
      }
    });

    let prevFocused = getFocusedTabId();
    const syncFocus = () => {
      const next = getFocusedTabId();
      if (next === prevFocused) return;
      prevFocused = next;
      if (next) {
        const toastId = toastIdFor(next);
        clearToastShortcut(toastId);
        toast.dismiss(toastId);
      }
    };
    const unsubLayout = useLayoutStore.subscribe(syncFocus);
    Router.events.on('routeChangeComplete', syncFocus);

    return () => {
      unsubTabs();
      unsubLayout();
      Router.events.off('routeChangeComplete', syncFocus);
      for (const cleanup of shortcutCleanups.values()) cleanup();
      shortcutCleanups.clear();
    };
  }, []);
};

export default useToastNotification;
