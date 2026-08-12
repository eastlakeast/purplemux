export const TAB_DRAG_MIME = 'application/x-purplemux-tab';
const TAB_DRAG_WORKSPACE_PREFIX = 'application/x-purplemux-workspace/';
const TAB_DRAG_PANE_PREFIX = 'application/x-purplemux-pane/';
let activeTabDragPayload: ITabDragPayload | null = null;

export type TTabSplitSide = 'left' | 'right' | 'top' | 'bottom';

export interface ITabDragPayload {
  tabId: string;
  sourcePaneId: string;
  sourceWorkspaceId: string;
}

interface IDataTransferReader {
  types: readonly string[];
  getData: (format: string) => string;
}

interface IDataTransferWriter extends IDataTransferReader {
  setData: (format: string, data: string) => void;
}

export const tabDragWorkspaceType = (workspaceId: string): string =>
  `${TAB_DRAG_WORKSPACE_PREFIX}${workspaceId}`;

export const tabDragPaneType = (paneId: string): string =>
  `${TAB_DRAG_PANE_PREFIX}${paneId}`;

export const hasTabDragData = (dataTransfer: Pick<IDataTransferReader, 'types'>): boolean =>
  Array.from(dataTransfer.types).includes(TAB_DRAG_MIME);

export const getTabDragSourceWorkspaceId = (
  dataTransfer: Pick<IDataTransferReader, 'types'>,
): string | null => {
  if (activeTabDragPayload) return activeTabDragPayload.sourceWorkspaceId;
  const type = Array.from(dataTransfer.types).find((candidate) =>
    candidate.startsWith(TAB_DRAG_WORKSPACE_PREFIX));
  return type?.slice(TAB_DRAG_WORKSPACE_PREFIX.length) || null;
};

export const getTabDragSourcePaneId = (
  dataTransfer: Pick<IDataTransferReader, 'types'>,
): string | null => {
  if (activeTabDragPayload) return activeTabDragPayload.sourcePaneId;
  const type = Array.from(dataTransfer.types).find((candidate) =>
    candidate.startsWith(TAB_DRAG_PANE_PREFIX));
  return type?.slice(TAB_DRAG_PANE_PREFIX.length) || null;
};

export const writeTabDragData = (
  dataTransfer: IDataTransferWriter,
  payload: ITabDragPayload,
): void => {
  activeTabDragPayload = payload;
  dataTransfer.setData(TAB_DRAG_MIME, JSON.stringify(payload));
  dataTransfer.setData('text/tab-id', payload.tabId);
  dataTransfer.setData('text/pane-id', payload.sourcePaneId);
  dataTransfer.setData(tabDragWorkspaceType(payload.sourceWorkspaceId), '');
  dataTransfer.setData(tabDragPaneType(payload.sourcePaneId), '');
};

export const getActiveTabDragData = (): ITabDragPayload | null => activeTabDragPayload;

export const clearActiveTabDragData = (): void => {
  activeTabDragPayload = null;
};

export const readTabDragData = (dataTransfer: IDataTransferReader): ITabDragPayload | null => {
  try {
    const parsed = JSON.parse(dataTransfer.getData(TAB_DRAG_MIME)) as Partial<ITabDragPayload>;
    if (
      typeof parsed.tabId !== 'string'
      || typeof parsed.sourcePaneId !== 'string'
      || typeof parsed.sourceWorkspaceId !== 'string'
      || !parsed.tabId
      || !parsed.sourcePaneId
      || !parsed.sourceWorkspaceId
    ) return null;
    return parsed as ITabDragPayload;
  } catch {
    return activeTabDragPayload;
  }
};

export const getTabSplitSide = (
  rect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
  clientX: number,
  clientY: number,
): TTabSplitSide => {
  const distances: Array<[TTabSplitSide, number]> = [
    ['left', Math.abs(clientX - rect.left)],
    ['right', Math.abs(rect.right - clientX)],
    ['top', Math.abs(clientY - rect.top)],
    ['bottom', Math.abs(rect.bottom - clientY)],
  ];
  distances.sort((a, b) => a[1] - b[1]);
  return distances[0][0];
};
