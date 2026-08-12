export const TIMELINE_AUTO_SCROLL_PAUSE_MS = 3 * 60 * 1000;

const TIMELINE_SCROLL_KEYS = new Set([
  'ArrowDown',
  'ArrowUp',
  'End',
  'Home',
  'PageDown',
  'PageUp',
  ' ',
]);

export const timelineAutoScrollPauseUntil = (now: number): number =>
  now + TIMELINE_AUTO_SCROLL_PAUSE_MS;

export const isTimelineAutoScrollPaused = (pauseUntil: number, now: number): boolean =>
  pauseUntil > now;

export const isTimelineScrollKey = (key: string): boolean => TIMELINE_SCROLL_KEYS.has(key);
