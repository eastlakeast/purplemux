import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getNotificationShortcutTarget,
  openNotificationShortcutTarget,
  registerNotificationShortcutTarget,
  removeNotificationShortcutTarget,
} from '@/lib/notification-shortcut';

const cleanupIds = new Set<string>();

const register = (id: string, open: () => void) => {
  cleanupIds.add(id);
  return registerNotificationShortcutTarget({ id, open });
};

afterEach(() => {
  for (const id of cleanupIds) removeNotificationShortcutTarget(id);
  cleanupIds.clear();
});

describe('notification shortcut targets', () => {
  it('opens and removes the current target', () => {
    const open = vi.fn();
    register('first', open);

    expect(getNotificationShortcutTarget()?.id).toBe('first');
    expect(openNotificationShortcutTarget()).toBe(true);
    expect(open).toHaveBeenCalledOnce();
    expect(getNotificationShortcutTarget()).toBeNull();
  });

  it('uses the most recently registered visible target', () => {
    const openFirst = vi.fn();
    const openSecond = vi.fn();
    register('first', openFirst);
    register('second', openSecond);

    expect(openNotificationShortcutTarget()).toBe(true);
    expect(openSecond).toHaveBeenCalledOnce();
    expect(openFirst).not.toHaveBeenCalled();
    expect(getNotificationShortcutTarget()?.id).toBe('first');
  });

  it('does not let stale cleanup remove a replacement target', () => {
    const cleanupOld = register('same', vi.fn());
    const replacement = vi.fn();
    register('same', replacement);

    cleanupOld();
    expect(getNotificationShortcutTarget()?.open).toBe(replacement);
  });
});
