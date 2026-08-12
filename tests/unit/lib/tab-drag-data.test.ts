import { afterEach, describe, expect, it } from 'vitest';
import {
  clearActiveTabDragData,
  getTabDragSourcePaneId,
  getTabDragSourceWorkspaceId,
  getTabSplitSide,
  hasTabDragData,
  readTabDragData,
  writeTabDragData,
} from '@/lib/tab-drag-data';

const createDataTransfer = () => {
  const data = new Map<string, string>();
  return {
    get types() {
      return [...data.keys()];
    },
    getData: (format: string) => data.get(format) ?? '',
    setData: (format: string, value: string) => data.set(format.toLowerCase(), value),
  };
};

describe('tab drag data', () => {
  afterEach(() => clearActiveTabDragData());

  it('retains exact workspace and pane IDs when drag types are lowercased', () => {
    const transfer = createDataTransfer();
    const payload = {
      tabId: 'tab-PUpQ-D',
      sourcePaneId: 'pane--vr1H4',
      sourceWorkspaceId: 'ws-dHIusm',
    };

    writeTabDragData(transfer, payload);

    expect(hasTabDragData(transfer)).toBe(true);
    expect(getTabDragSourceWorkspaceId(transfer)).toBe(payload.sourceWorkspaceId);
    expect(getTabDragSourcePaneId(transfer)).toBe(payload.sourcePaneId);
    expect(readTabDragData(transfer)).toEqual(payload);
  });

  it('selects the nearest pane edge as the split side', () => {
    const rect = { left: 100, right: 500, top: 200, bottom: 600 };

    expect(getTabSplitSide(rect, 105, 400)).toBe('left');
    expect(getTabSplitSide(rect, 495, 400)).toBe('right');
    expect(getTabSplitSide(rect, 300, 205)).toBe('top');
    expect(getTabSplitSide(rect, 300, 595)).toBe('bottom');
  });
});
