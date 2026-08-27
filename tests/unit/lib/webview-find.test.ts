import { describe, expect, it, vi } from 'vitest';
import { findInReadyWebview, stopFindInReadyWebview } from '@/lib/webview-find';

const createWebview = ({ connected = true, throws = false } = {}) => ({
  isConnected: connected,
  findInPage: vi.fn(() => {
    if (throws) throw new Error('webview detached');
    return 7;
  }),
  stopFindInPage: vi.fn(() => {
    if (throws) throw new Error('webview detached');
  }),
});

describe('webview find lifecycle', () => {
  it('runs find operations only after dom-ready while attached', () => {
    const webview = createWebview();

    expect(findInReadyWebview(webview, true, 'purplemux', {
      forward: true,
      findNext: true,
    })).toBe(7);
    expect(webview.findInPage).toHaveBeenCalledOnce();

    expect(findInReadyWebview(webview, false, 'purplemux', {
      forward: true,
      findNext: true,
    })).toBeNull();
    expect(webview.findInPage).toHaveBeenCalledOnce();
  });

  it('skips detached webviews and absorbs detach races', () => {
    const detached = createWebview({ connected: false });
    const racing = createWebview({ throws: true });

    expect(stopFindInReadyWebview(detached, true)).toBe(false);
    expect(detached.stopFindInPage).not.toHaveBeenCalled();
    expect(stopFindInReadyWebview(racing, true)).toBe(false);
    expect(racing.stopFindInPage).toHaveBeenCalledOnce();

    expect(findInReadyWebview(racing, true, 'purplemux', {
      forward: true,
      findNext: false,
    })).toBeNull();
  });
});
