import { describe, expect, it } from 'vitest';
import {
  isTimelineAutoScrollPaused,
  isTimelineScrollKey,
  TIMELINE_AUTO_SCROLL_PAUSE_MS,
  timelineAutoScrollPauseUntil,
} from '@/lib/timeline-auto-scroll';

describe('timeline auto scroll', () => {
  it('pauses bottom pinning for three minutes from the latest user scroll', () => {
    const now = 1_000;
    const pauseUntil = timelineAutoScrollPauseUntil(now);

    expect(TIMELINE_AUTO_SCROLL_PAUSE_MS).toBe(180_000);
    expect(pauseUntil).toBe(181_000);
    expect(isTimelineAutoScrollPaused(pauseUntil, pauseUntil - 1)).toBe(true);
    expect(isTimelineAutoScrollPaused(pauseUntil, pauseUntil)).toBe(false);
  });

  it('recognizes keyboard actions that directly move a focused timeline', () => {
    for (const key of ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']) {
      expect(isTimelineScrollKey(key)).toBe(true);
    }
    expect(isTimelineScrollKey('Enter')).toBe(false);
  });
});
