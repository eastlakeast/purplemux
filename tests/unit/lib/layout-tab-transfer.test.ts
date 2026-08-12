import { describe, expect, it } from 'vitest';
import { collectAllTabs, collectPanes, findPane } from '@/lib/layout-tree';
import { moveTabAcrossLayouts, splitTabIntoPane } from '@/lib/layout-tab-transfer';
import type { ILayoutData, ITab } from '@/types/terminal';

const tab = (id: string, order: number): ITab => ({
  id,
  order,
  name: id,
  sessionName: `session-${id}`,
});

const singlePaneLayout = (...tabs: ITab[]): ILayoutData => ({
  root: {
    type: 'pane',
    id: 'pane-1',
    tabs,
    activeTabId: tabs.at(-1)?.id ?? null,
  },
  activePaneId: 'pane-1',
  updatedAt: '2026-08-12T00:00:00.000Z',
});

describe('layout tab transfer', () => {
  it('splits one tab to the requested edge and preserves the remaining tab', () => {
    const layout = singlePaneLayout(tab('tab-1', 0), tab('tab-2', 1));

    expect(splitTabIntoPane(layout, 'pane-1', 'tab-2', 'right', 'pane-2')).toBe(true);

    expect(layout.root).toMatchObject({
      type: 'split',
      orientation: 'horizontal',
      children: [
        { type: 'pane', id: 'pane-1', activeTabId: 'tab-1' },
        { type: 'pane', id: 'pane-2', activeTabId: 'tab-2' },
      ],
    });
    expect(findPane(layout.root, 'pane-1')?.tabs.map((item) => item.id)).toEqual(['tab-1']);
    expect(findPane(layout.root, 'pane-2')?.tabs.map((item) => item.id)).toEqual(['tab-2']);
    expect(layout.activePaneId).toBe('pane-2');
  });

  it('places a top split before the source pane', () => {
    const layout = singlePaneLayout(tab('tab-1', 0), tab('tab-2', 1));

    expect(splitTabIntoPane(layout, 'pane-1', 'tab-1', 'top', 'pane-2')).toBe(true);

    expect(layout.root).toMatchObject({
      type: 'split',
      orientation: 'vertical',
      children: [
        { type: 'pane', id: 'pane-2' },
        { type: 'pane', id: 'pane-1' },
      ],
    });
  });

  it('does not split the only tab out of a pane', () => {
    const layout = singlePaneLayout(tab('tab-1', 0));

    expect(splitTabIntoPane(layout, 'pane-1', 'tab-1', 'right', 'pane-2')).toBe(false);
    expect(layout.root.type).toBe('pane');
  });

  it('moves a tab across workspace layouts and assigns the target session name', () => {
    const source = singlePaneLayout(tab('tab-1', 0));
    const target = singlePaneLayout(tab('target-1', 0));

    const result = moveTabAcrossLayouts(
      source,
      target,
      'pane-1',
      'tab-1',
      'pane-1',
      (paneId) => `pt-ws-target-${paneId}-tab-tab-1`,
    );

    expect(result).toMatchObject({
      sourceEmpty: true,
      targetPaneId: 'pane-1',
      tab: { id: 'tab-1', sessionName: 'pt-ws-target-pane-1-tab-tab-1' },
    });
    expect(collectAllTabs(source.root)).toEqual([]);
    expect(collectAllTabs(target.root).map((item) => [item.id, item.order])).toEqual([
      ['target-1', 0],
      ['tab-1', 1],
    ]);
    expect(findPane(target.root, 'pane-1')?.activeTabId).toBe('tab-1');
  });

  it('removes an emptied source pane while keeping its sibling', () => {
    const source: ILayoutData = {
      root: {
        type: 'split',
        orientation: 'horizontal',
        ratio: 50,
        children: [
          { type: 'pane', id: 'left', tabs: [tab('tab-1', 0)], activeTabId: 'tab-1' },
          { type: 'pane', id: 'right', tabs: [tab('tab-2', 0)], activeTabId: 'tab-2' },
        ],
      },
      activePaneId: 'left',
      updatedAt: '2026-08-12T00:00:00.000Z',
    };
    const target = singlePaneLayout(tab('target-1', 0));

    const result = moveTabAcrossLayouts(
      source,
      target,
      'left',
      'tab-1',
      undefined,
      () => 'session-moved',
    );

    expect(result?.sourceEmpty).toBe(false);
    expect(collectPanes(source.root).map((pane) => pane.id)).toEqual(['right']);
    expect(source.activePaneId).toBe('right');
  });
});
