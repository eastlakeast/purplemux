import { useEffect } from 'react';
import { useRouter } from 'next/router';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import { useSelectWorkspace } from '@/hooks/use-sidebar-actions';
import useKeybindingsStore from '@/hooks/use-keybindings-store';
import useBoundHotkey from '@/hooks/use-bound-hotkey';
import { getVisibleOrderedWorkspaces } from '@/lib/workspace-order';

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

const useGlobalShortcuts = () => {
  const selectWorkspace = useSelectWorkspace();
  const router = useRouter();
  const isSettingsDialogOpen = useWorkspaceStore((s) => s.isSettingsDialogOpen);
  const isCheatSheetOpen = useWorkspaceStore((s) => s.isCheatSheetOpen);
  const enabled = !isSettingsDialogOpen && !isCheatSheetOpen;

  useBoundHotkey(
    'workspace.switch',
    (event) => {
      const { workspaces, groups, sidebarOrder } = useWorkspaceStore.getState();
      const visibleWorkspaces = getVisibleOrderedWorkspaces(workspaces, groups, sidebarOrder);
      const digit = parseInt(event.code.replace('Digit', ''), 10);
      if (isNaN(digit) || digit < 1 || digit > 9) return;

      const workspace =
        digit === 9
          ? visibleWorkspaces[visibleWorkspaces.length - 1]
          : visibleWorkspaces[digit - 1];
      if (workspace) {
        selectWorkspace(workspace.id);
      }
    },
    enabled,
  );

  useBoundHotkey(
    'app.settings',
    () => {
      window.dispatchEvent(new Event('open-settings'));
    },
    true,
  );

  useBoundHotkey(
    'app.new_window',
    () => {
      const api = (window as unknown as { electronAPI?: { openNewWindow?: () => void } }).electronAPI;
      api?.openNewWindow?.();
    },
    true,
  );

  useBoundHotkey(
    'workspace.new',
    async () => {
      const store = useWorkspaceStore.getState();
      const ws = await store.createWorkspace('');
      if (ws) selectWorkspace(ws.id);
    },
    enabled,
  );

  useBoundHotkey(
    'workspace.rename',
    () => {
      const { activeWorkspaceId } = useWorkspaceStore.getState();
      if (!activeWorkspaceId) return;
      window.dispatchEvent(
        new CustomEvent('rename-workspace', { detail: activeWorkspaceId }),
      );
    },
    enabled,
  );

  useBoundHotkey(
    'view.toggle_sidebar',
    () => {
      useWorkspaceStore.getState().toggleSidebar();
    },
    enabled,
  );

  useBoundHotkey(
    'view.toggle_sidebar_tab',
    () => {
      const store = useWorkspaceStore.getState();
      const next = store.sidebarTab === 'workspace' ? 'sessions' : 'workspace';
      store.setSidebarTab(next);
      if (store.sidebarCollapsed) store.toggleSidebar();
    },
    enabled,
  );

  useBoundHotkey(
    'view.notes',
    () => {
      router.push('/reports');
    },
    enabled,
  );

  useBoundHotkey(
    'view.stats',
    () => {
      router.push('/stats');
    },
    enabled,
  );

  useEffect(() => {
    if (!useKeybindingsStore.getState().loaded) {
      useKeybindingsStore.getState().load();
    }
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== '?') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      const ws = useWorkspaceStore.getState();
      if (ws.isSettingsDialogOpen || ws.isCheatSheetOpen) return;
      e.preventDefault();
      ws.setCheatSheetOpen(true);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
};

export default useGlobalShortcuts;
