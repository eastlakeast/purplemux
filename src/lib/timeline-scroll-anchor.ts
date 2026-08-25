interface ITimelineItemBounds {
  id: string;
  top: number;
  bottom: number;
}

interface ITimelineScrollSnapshot {
  root: HTMLElement;
  paneId: string | null;
  itemId: string | null;
  itemOffset: number;
  scrollTop: number;
  width: number;
  height: number;
  wasAtBottom: boolean;
}

export interface ITimelineScrollRestoreOptions {
  fallbackToBottom?: boolean;
}

export interface ITimelinePrependScrollSnapshot {
  root: HTMLElement;
  itemId: string | null;
  itemOffset: number;
  scrollTop: number;
  scrollHeight: number;
  previousOverflowAnchor: string;
}

const RESTORE_DURATION_MS = 450;
const WAIT_FOR_REFLOW_MS = 800;
const WAIT_FOR_ROOT_REATTACH_MS = 3_000;

export const findVisibleTimelineItem = (
  items: ITimelineItemBounds[],
  viewportTop: number,
  viewportBottom: number,
): ITimelineItemBounds | null =>
  items.find((item) => item.bottom > viewportTop && item.top < viewportBottom) ?? null;

export const anchoredScrollTop = (
  scrollTop: number,
  currentItemOffset: number,
  capturedItemOffset: number,
): number => Math.max(0, scrollTop + currentItemOffset - capturedItemOffset);

export const prependAnchoredScrollTop = (
  scrollTop: number,
  currentItemOffset: number | null,
  capturedItemOffset: number,
  scrollHeightDelta: number,
): number => currentItemOffset === null
  ? Math.max(0, scrollTop + scrollHeightDelta)
  : anchoredScrollTop(scrollTop, currentItemOffset, capturedItemOffset);

export const createTimelineScrollAnchorId = (
  ...parts: Array<string | number | boolean | null | undefined>
): string => {
  let hash = 2_166_136_261;
  for (const part of parts) {
    const value = `${part ?? ''}\u001f`;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16_777_619);
    }
  }
  return `${parts[0] ?? 'entry'}-${(hash >>> 0).toString(36)}`;
};

export const calculateTimelineSpacerHeight = (
  viewportHeight: number,
  userMessageHeight: number,
  contentAfterUserHeight: number,
  anchorOffset: number,
): number => Math.max(
  0,
  viewportHeight - userMessageHeight - anchorOffset - contentAfterUserHeight,
);

const getTimelineItems = (root: HTMLElement): HTMLElement[] => {
  const stableAnchors = Array.from(
    root.querySelectorAll<HTMLElement>('[data-timeline-scroll-anchor]'),
  );
  return stableAnchors.length > 0
    ? stableAnchors
    : Array.from(root.querySelectorAll<HTMLElement>('[data-timeline-item]'));
};

const getTimelineItemId = (item: HTMLElement): string =>
  item.dataset.timelineScrollAnchor ?? item.dataset.timelineItem ?? '';

const findItemById = (root: HTMLElement, itemId: string): HTMLElement | null =>
  getTimelineItems(root).find((item) => getTimelineItemId(item) === itemId) ?? null;

const resolveRoot = (snapshot: ITimelineScrollSnapshot): HTMLElement | null => {
  if (snapshot.root.isConnected) return snapshot.root;
  if (!snapshot.paneId) return null;
  const pane = Array.from(document.querySelectorAll<HTMLElement>('[data-pane-id]'))
    .find((candidate) => candidate.dataset.paneId === snapshot.paneId);
  return pane?.querySelector<HTMLElement>('[role="log"]') ?? null;
};

export const captureTimelineScroll = (target: HTMLElement): ITimelineScrollSnapshot | null => {
  const root = target.closest<HTMLElement>('[role="log"]');
  if (!root) return null;

  const rootRect = root.getBoundingClientRect();
  const items = getTimelineItems(root);
  const visible = findVisibleTimelineItem(
    items.map((item) => {
      const rect = item.getBoundingClientRect();
      return { id: getTimelineItemId(item), top: rect.top, bottom: rect.bottom };
    }),
    rootRect.top,
    rootRect.bottom,
  );

  return {
    root,
    paneId: target.closest<HTMLElement>('[data-pane-id]')?.dataset.paneId ?? null,
    itemId: visible?.id || null,
    itemOffset: visible ? visible.top - rootRect.top : 0,
    scrollTop: root.scrollTop,
    width: root.clientWidth,
    height: root.clientHeight,
    wasAtBottom: root.scrollHeight - root.scrollTop - root.clientHeight <= 4,
  };
};

export const captureTimelinePrependScroll = (
  root: HTMLElement,
): ITimelinePrependScrollSnapshot => {
  const rootRect = root.getBoundingClientRect();
  const visible = findVisibleTimelineItem(
    getTimelineItems(root).map((item) => {
      const rect = item.getBoundingClientRect();
      return { id: getTimelineItemId(item), top: rect.top, bottom: rect.bottom };
    }),
    rootRect.top,
    rootRect.bottom,
  );
  const previousOverflowAnchor = root.style.overflowAnchor;
  root.style.overflowAnchor = 'none';

  return {
    root,
    itemId: visible?.id || null,
    itemOffset: visible ? visible.top - rootRect.top : 0,
    scrollTop: root.scrollTop,
    scrollHeight: root.scrollHeight,
    previousOverflowAnchor,
  };
};

export const restoreTimelinePrependScroll = (
  snapshot: ITimelinePrependScrollSnapshot,
): boolean => {
  const { root } = snapshot;
  if (!root.isConnected) return false;

  const item = snapshot.itemId ? findItemById(root, snapshot.itemId) : null;
  const currentOffset = item
    ? item.getBoundingClientRect().top - root.getBoundingClientRect().top
    : null;
  const scrollHeightDelta = root.scrollHeight - snapshot.scrollHeight;
  root.scrollTop = prependAnchoredScrollTop(
    root.scrollTop,
    currentOffset,
    snapshot.itemOffset,
    scrollHeightDelta,
  );
  snapshot.scrollHeight = root.scrollHeight;
  return item !== null;
};

export const releaseTimelinePrependScroll = (
  snapshot: ITimelinePrependScrollSnapshot,
): void => {
  if (snapshot.root.isConnected) {
    snapshot.root.style.overflowAnchor = snapshot.previousOverflowAnchor;
  }
};

export const restoreTimelineScrollAfterLayout = (
  snapshot: ITimelineScrollSnapshot,
  options: ITimelineScrollRestoreOptions = {},
): (() => void) => {
  let frameId = 0;
  let changedAt: number | null = null;
  const startedAt = performance.now();
  let styledRoot: HTMLElement | null = null;
  let previousScrollBehavior = '';
  let previousOverflowAnchor = '';

  const cleanup = () => {
    cancelAnimationFrame(frameId);
    if (styledRoot) {
      styledRoot.style.scrollBehavior = previousScrollBehavior;
      styledRoot.style.overflowAnchor = previousOverflowAnchor;
    }
  };

  const restore = (root: HTMLElement) => {
    if (styledRoot !== root) {
      if (styledRoot) {
        styledRoot.style.scrollBehavior = previousScrollBehavior;
        styledRoot.style.overflowAnchor = previousOverflowAnchor;
      }
      styledRoot = root;
      previousScrollBehavior = root.style.scrollBehavior;
      previousOverflowAnchor = root.style.overflowAnchor;
      root.style.scrollBehavior = 'auto';
      root.style.overflowAnchor = 'none';
    }

    if (snapshot.wasAtBottom) {
      root.scrollTop = root.scrollHeight;
      return;
    }
    if (!snapshot.itemId) {
      root.scrollTop = options.fallbackToBottom ? root.scrollHeight : snapshot.scrollTop;
      return;
    }
    const item = findItemById(root, snapshot.itemId);
    if (!item) {
      if (options.fallbackToBottom) root.scrollTop = root.scrollHeight;
      return;
    }
    const rootTop = root.getBoundingClientRect().top;
    const currentOffset = item.getBoundingClientRect().top - rootTop;
    root.scrollTop = anchoredScrollTop(root.scrollTop, currentOffset, snapshot.itemOffset);
  };

  const tick = (now: number) => {
    const root = resolveRoot(snapshot);
    if (!root) {
      if (now - startedAt < WAIT_FOR_ROOT_REATTACH_MS) {
        frameId = requestAnimationFrame(tick);
      } else {
        cleanup();
      }
      return;
    }

    if (
      Math.abs(root.clientWidth - snapshot.width) > 1
      || Math.abs(root.clientHeight - snapshot.height) > 1
    ) {
      changedAt ??= now;
      restore(root);
    }

    const waitingForReflow = changedAt === null && now - startedAt < WAIT_FOR_REFLOW_MS;
    const retainingAnchor = changedAt !== null && now - changedAt < RESTORE_DURATION_MS;
    if (waitingForReflow || retainingAnchor) {
      frameId = requestAnimationFrame(tick);
    } else {
      cleanup();
    }
  };

  frameId = requestAnimationFrame(tick);
  return cleanup;
};
