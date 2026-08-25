import { describe, expect, it } from 'vitest';
import {
  anchoredScrollTop,
  captureTimelineScroll,
  captureTimelinePrependScroll,
  calculateTimelineSpacerHeight,
  createTimelineScrollAnchorId,
  findVisibleTimelineItem,
  prependAnchoredScrollTop,
  releaseTimelinePrependScroll,
  restoreTimelineScrollAfterLayout,
  restoreTimelinePrependScroll,
} from '@/lib/timeline-scroll-anchor';

describe('timeline scroll anchoring', () => {
  it('selects the first item intersecting the viewport', () => {
    const item = findVisibleTimelineItem([
      { id: 'above', top: 20, bottom: 90 },
      { id: 'visible', top: 90, bottom: 180 },
      { id: 'below', top: 180, bottom: 240 },
    ], 100, 200);

    expect(item?.id).toBe('visible');
  });

  it('keeps the captured item at the same viewport offset after reflow', () => {
    expect(anchoredScrollTop(500, 140, 40)).toBe(600);
    expect(anchoredScrollTop(20, -80, 40)).toBe(0);
  });

  it('keeps the captured item offset when older content is prepended', () => {
    expect(prependAnchoredScrollTop(0, 640, 48, 0)).toBe(592);
    expect(prependAnchoredScrollTop(220, 712, 52, 220)).toBe(880);
  });

  it('preserves scrollTop when no stable timeline item is visible', () => {
    expect(prependAnchoredScrollTop(0, null, 0, 0)).toBe(0);
    expect(prependAnchoredScrollTop(300, null, 0, 180)).toBe(480);
    expect(prependAnchoredScrollTop(20, null, 0, -80)).toBe(0);
  });

  it('creates stable anchor IDs from timeline content rather than parser IDs', () => {
    const first = createTimelineScrollAnchorId('assistant-message', 1234, 'same response');
    const reparsed = createTimelineScrollAnchorId('assistant-message', 1234, 'same response');
    const changed = createTimelineScrollAnchorId('assistant-message', 1234, 'different response');

    expect(reparsed).toBe(first);
    expect(changed).not.toBe(first);
  });

  it('restores the same DOM item offset after prepending content', () => {
    let itemTop = 148;
    const item = {
      dataset: { timelineScrollAnchor: 'stable-item' },
      getBoundingClientRect: () => ({ top: itemTop, bottom: itemTop + 80 }),
    } as unknown as HTMLElement;
    const root = {
      isConnected: true,
      scrollTop: 0,
      scrollHeight: 900,
      style: { overflowAnchor: 'auto' },
      getBoundingClientRect: () => ({ top: 100, bottom: 700 }),
      querySelectorAll: () => [item],
    } as unknown as HTMLElement;

    const snapshot = captureTimelinePrependScroll(root);
    expect(snapshot.itemId).toBe('stable-item');
    expect(snapshot.itemOffset).toBe(48);
    expect(root.style.overflowAnchor).toBe('none');

    itemTop = 740;
    Object.assign(root, { scrollHeight: 1492 });
    expect(restoreTimelinePrependScroll(snapshot)).toBe(true);
    expect(root.scrollTop).toBe(592);

    releaseTimelinePrependScroll(snapshot);
    expect(root.style.overflowAnchor).toBe('auto');
  });

  it('waits for a remounted timeline root and falls back to its bottom', () => {
    const originalDocument = globalThis.document;
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    const frames: FrameRequestCallback[] = [];
    let remountedRoot: HTMLElement | null = null;
    const pane = {
      dataset: { paneId: 'pane-one' },
      querySelector: () => remountedRoot,
    } as unknown as HTMLElement;
    const oldRootState = {
      isConnected: true,
      clientWidth: 800,
      clientHeight: 300,
      scrollHeight: 1_000,
      scrollTop: 200,
      style: { scrollBehavior: '', overflowAnchor: '' },
      closest: (selector: string) => selector === '[role="log"]'
        ? oldRoot
        : { dataset: { paneId: 'pane-one' } },
      getBoundingClientRect: () => ({ top: 100, bottom: 400 }),
      querySelectorAll: () => [],
    };
    const oldRoot = oldRootState as unknown as HTMLElement;

    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { querySelectorAll: () => [pane] },
    });
    Object.defineProperty(globalThis, 'requestAnimationFrame', {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      },
    });
    Object.defineProperty(globalThis, 'cancelAnimationFrame', {
      configurable: true,
      value: () => {},
    });

    try {
      const snapshot = captureTimelineScroll(oldRoot);
      expect(snapshot).not.toBeNull();
      oldRootState.isConnected = false;
      const cleanup = restoreTimelineScrollAfterLayout(snapshot!, { fallbackToBottom: true });
      const startedAt = performance.now();

      frames.shift()?.(startedAt + 16);
      expect(frames).toHaveLength(1);

      remountedRoot = {
        isConnected: true,
        clientWidth: 400,
        clientHeight: 300,
        scrollHeight: 1_200,
        scrollTop: 0,
        style: { scrollBehavior: '', overflowAnchor: '' },
        getBoundingClientRect: () => ({ top: 100, bottom: 400 }),
        querySelectorAll: () => [],
      } as unknown as HTMLElement;
      frames.shift()?.(startedAt + 32);

      expect(remountedRoot.scrollTop).toBe(1_200);
      cleanup();
    } finally {
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: originalDocument,
      });
      Object.defineProperty(globalThis, 'requestAnimationFrame', {
        configurable: true,
        value: originalRequestAnimationFrame,
      });
      Object.defineProperty(globalThis, 'cancelAnimationFrame', {
        configurable: true,
        value: originalCancelAnimationFrame,
      });
    }
  });

  it('consumes pinned bottom space as response content grows', () => {
    expect(calculateTimelineSpacerHeight(800, 60, 100, 12)).toBe(628);
    expect(calculateTimelineSpacerHeight(800, 60, 728, 12)).toBe(0);
    expect(calculateTimelineSpacerHeight(800, 60, 900, 12)).toBe(0);
  });
});
