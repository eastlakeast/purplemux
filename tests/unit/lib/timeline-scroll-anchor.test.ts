import { describe, expect, it } from 'vitest';
import {
  anchoredScrollTop,
  calculateTimelineSpacerHeight,
  findVisibleTimelineItem,
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

  it('consumes pinned bottom space as response content grows', () => {
    expect(calculateTimelineSpacerHeight(800, 60, 100, 12)).toBe(628);
    expect(calculateTimelineSpacerHeight(800, 60, 728, 12)).toBe(0);
    expect(calculateTimelineSpacerHeight(800, 60, 900, 12)).toBe(0);
  });
});
