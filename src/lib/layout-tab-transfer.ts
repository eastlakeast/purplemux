import {
  collectAllTabs,
  collectPanes,
  findPane,
  isEqualized,
  equalizeNode,
  removePaneWithFocus,
  replacePane,
} from '@/lib/layout-tree';
import type { ILayoutData, IPaneNode, ITab, TLayoutNode } from '@/types/terminal';
import type { TTabSplitSide } from '@/lib/tab-drag-data';

const normalizePaneTabs = (pane: IPaneNode): void => {
  pane.tabs.forEach((tab, index) => {
    tab.order = index;
  });
};

export const splitTabIntoPane = (
  layout: ILayoutData,
  sourcePaneId: string,
  tabId: string,
  side: TTabSplitSide,
  newPaneId: string,
): boolean => {
  const sourcePane = findPane(layout.root, sourcePaneId);
  if (!sourcePane || sourcePane.tabs.length <= 1) return false;
  const tabIndex = sourcePane.tabs.findIndex((tab) => tab.id === tabId);
  if (tabIndex === -1) return false;

  const wasEqualized = isEqualized(layout.root);
  const [tab] = sourcePane.tabs.splice(tabIndex, 1);
  normalizePaneTabs(sourcePane);
  if (sourcePane.activeTabId === tabId) {
    sourcePane.activeTabId = sourcePane.tabs[Math.min(tabIndex, sourcePane.tabs.length - 1)]?.id ?? null;
  }

  const newPane: IPaneNode = {
    type: 'pane',
    id: newPaneId,
    tabs: [{ ...tab, order: 0 }],
    activeTabId: tabId,
  };
  const orientation = side === 'left' || side === 'right' ? 'horizontal' : 'vertical';
  const sourceNode: IPaneNode = { ...sourcePane, tabs: [...sourcePane.tabs] };
  const movedFirst = side === 'left' || side === 'top';
  const children: [TLayoutNode, TLayoutNode] = movedFirst
    ? [newPane, sourceNode]
    : [sourceNode, newPane];
  const splitNode: TLayoutNode = { type: 'split', orientation, ratio: 50, children };

  layout.root = replacePane(layout.root, sourcePaneId, splitNode);
  if (wasEqualized) layout.root = equalizeNode(layout.root);
  layout.activePaneId = newPaneId;
  return true;
};

export interface IMoveTabAcrossLayoutsResult {
  tab: ITab;
  targetPaneId: string;
  sourceEmpty: boolean;
}

export const moveTabAcrossLayouts = (
  sourceLayout: ILayoutData,
  targetLayout: ILayoutData,
  sourcePaneId: string,
  tabId: string,
  requestedTargetPaneId: string | undefined,
  nextSessionName: (targetPaneId: string) => string,
): IMoveTabAcrossLayoutsResult | null => {
  if (collectAllTabs(targetLayout.root).some((tab) => tab.id === tabId)) return null;
  const sourcePane = findPane(sourceLayout.root, sourcePaneId);
  if (!sourcePane) return null;
  const tabIndex = sourcePane.tabs.findIndex((tab) => tab.id === tabId);
  if (tabIndex === -1) return null;

  const targetPane = (
    requestedTargetPaneId ? findPane(targetLayout.root, requestedTargetPaneId) : null
  ) ?? (
    targetLayout.activePaneId ? findPane(targetLayout.root, targetLayout.activePaneId) : null
  ) ?? collectPanes(targetLayout.root)[0];
  if (!targetPane) return null;

  const [tab] = sourcePane.tabs.splice(tabIndex, 1);
  normalizePaneTabs(sourcePane);
  if (sourcePane.activeTabId === tabId) {
    sourcePane.activeTabId = sourcePane.tabs[Math.min(tabIndex, sourcePane.tabs.length - 1)]?.id ?? null;
  }
  if (sourcePane.tabs.length === 0 && collectPanes(sourceLayout.root).length > 1) {
    removePaneWithFocus(sourceLayout, sourcePaneId);
  }

  tab.sessionName = nextSessionName(targetPane.id);
  targetPane.tabs.push(tab);
  normalizePaneTabs(targetPane);
  targetPane.activeTabId = tab.id;
  targetLayout.activePaneId = targetPane.id;

  return {
    tab,
    targetPaneId: targetPane.id,
    sourceEmpty: collectAllTabs(sourceLayout.root).length === 0,
  };
};
