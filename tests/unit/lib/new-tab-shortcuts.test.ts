import { describe, expect, it } from 'vitest';
import { findNewTabShortcutIndex } from '@/lib/new-tab-shortcuts';

const shortcuts = ['c', 'x', 's', 't', 'w', 'd'];

const event = (key: string, overrides = {}) => ({
  key,
  code: `Key${key.toUpperCase()}`,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  isComposing: false,
  repeat: false,
  ...overrides,
});

describe('new tab shortcuts', () => {
  it.each([
    ['c', 0],
    ['x', 1],
    ['s', 2],
    ['t', 3],
    ['w', 4],
    ['d', 5],
  ])('maps %s to its menu item', (key, expectedIndex) => {
    expect(findNewTabShortcutIndex(shortcuts, event(key))).toBe(expectedIndex);
  });

  it('ignores modified, composing, and repeated keys', () => {
    expect(findNewTabShortcutIndex(shortcuts, event('c', { metaKey: true }))).toBe(-1);
    expect(findNewTabShortcutIndex(shortcuts, event('c', { ctrlKey: true }))).toBe(-1);
    expect(findNewTabShortcutIndex(shortcuts, event('c', { altKey: true }))).toBe(-1);
    expect(findNewTabShortcutIndex(shortcuts, event('c', { code: '', isComposing: true }))).toBe(-1);
    expect(findNewTabShortcutIndex(shortcuts, event('c', { repeat: true }))).toBe(-1);
  });

  it('uses the physical key while an IME is composing', () => {
    expect(findNewTabShortcutIndex(shortcuts, event('Process', {
      code: 'KeyD',
      isComposing: true,
    }))).toBe(5);
  });
});
