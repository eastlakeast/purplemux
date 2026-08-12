import { useState, useRef, useCallback } from 'react';
import type { ITab } from '@/types/terminal';
import {
  clearActiveTabDragData,
  getTabDragSourcePaneId,
  writeTabDragData,
} from '@/lib/tab-drag-data';

interface IUseTabDragOptions {
  paneId: string;
  workspaceId: string;
  sortedTabs: ITab[];
  onReorderTabs: (tabIds: string[]) => void;
  onMoveTab: (tabId: string, fromPaneId: string, toIndex: number) => void;
}

const useTabDrag = ({ paneId, workspaceId, sortedTabs, onReorderTabs, onMoveTab }: IUseTabDragOptions) => {
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; side: 'left' | 'right' } | null>(null);
  const [isDragOverFromOther, setIsDragOverFromOther] = useState(false);
  const dragEnterCountRef = useRef(0);

  const handleDragOver = useCallback((e: React.DragEvent, tabId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const side = e.clientX < rect.left + rect.width / 2 ? 'left' : 'right';
    setDropTarget({ id: tabId, side });
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragEnterCountRef.current = 0;
    setIsDragOverFromOther(false);

    const draggedId = e.dataTransfer.getData('text/tab-id');
    const sourcePaneId = e.dataTransfer.getData('text/pane-id');

    if (!draggedId) {
      setDraggedTabId(null);
      setDropTarget(null);
      return;
    }

    if (sourcePaneId && sourcePaneId !== paneId) {
      const toIndex = dropTarget
        ? (() => {
            const targetIdx = sortedTabs.findIndex((t) => t.id === dropTarget.id);
            return dropTarget.side === 'right' ? targetIdx + 1 : targetIdx;
          })()
        : sortedTabs.length;

      onMoveTab(draggedId, sourcePaneId, toIndex);
      setDraggedTabId(null);
      setDropTarget(null);
      return;
    }

    if (!dropTarget || draggedId === dropTarget.id) {
      setDraggedTabId(null);
      setDropTarget(null);
      return;
    }

    const newOrder = sortedTabs.filter((t) => t.id !== draggedId);
    const targetIdx = newOrder.findIndex((t) => t.id === dropTarget.id);
    const insertIdx = dropTarget.side === 'right' ? targetIdx + 1 : targetIdx;
    const draggedTab = sortedTabs.find((t) => t.id === draggedId);
    if (draggedTab) {
      newOrder.splice(insertIdx, 0, draggedTab);
    }
    onReorderTabs(newOrder.map((t) => t.id));
    setDraggedTabId(null);
    setDropTarget(null);
  }, [paneId, sortedTabs, dropTarget, onMoveTab, onReorderTabs]);

  const handleTabBarDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragEnterCountRef.current++;
    const sourcePaneId = getTabDragSourcePaneId(e.dataTransfer);
    if (sourcePaneId !== null && sourcePaneId !== paneId) {
      setIsDragOverFromOther(true);
    }
  }, [paneId]);

  const handleTabBarDragLeave = useCallback(() => {
    dragEnterCountRef.current--;
    if (dragEnterCountRef.current <= 0) {
      dragEnterCountRef.current = 0;
      setIsDragOverFromOther(false);
      setDropTarget(null);
    }
  }, []);

  const startDrag = useCallback((e: React.DragEvent, tabId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    writeTabDragData(e.dataTransfer, {
      tabId,
      sourcePaneId: paneId,
      sourceWorkspaceId: workspaceId,
    });

    const ghost = e.currentTarget.cloneNode(true) as HTMLElement;
    ghost.querySelector('[aria-label="탭 닫기"]')?.remove();
    ghost.querySelectorAll('.sr-only').forEach((el) => el.remove());
    ghost.style.cssText =
      'position:fixed;left:-9999px;display:flex;align-items:center;gap:6px;padding:4px 12px;background:var(--card);color:var(--foreground);border:none;border-radius:4px;font-size:12px;opacity:0.6;transform:scale(0.9);white-space:nowrap;';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    requestAnimationFrame(() => ghost.remove());

    setDraggedTabId(tabId);
  }, [paneId, workspaceId]);

  const endDrag = useCallback(() => {
    clearActiveTabDragData();
    setDraggedTabId(null);
    setDropTarget(null);
  }, []);

  const clearDropTarget = useCallback(() => {
    setDropTarget(null);
  }, []);

  return {
    draggedTabId,
    dropTarget,
    isDragOverFromOther,
    handleDragOver,
    handleDrop,
    handleTabBarDragEnter,
    handleTabBarDragLeave,
    startDrag,
    endDrag,
    clearDropTarget,
  };
};

export default useTabDrag;
