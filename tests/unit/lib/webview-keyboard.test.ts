import { describe, expect, it } from 'vitest';
import {
  includeWebviewFindShortcuts,
  isWebviewFindShortcut,
  normalizeWebviewKeyboardInput,
} from '@/lib/webview-keyboard';

describe('webview keyboard input', () => {
  it('normalizes modifiers in the same order as host keyboard shortcuts', () => {
    expect(normalizeWebviewKeyboardInput({
      type: 'keyDown',
      key: 'w',
      code: 'KeyW',
      isAutoRepeat: false,
      shift: true,
      control: true,
      alt: true,
      meta: true,
    })).toBe('meta+ctrl+alt+shift+KeyW');
  });

  it('keeps unmodified keys distinct from application shortcuts', () => {
    expect(normalizeWebviewKeyboardInput({
      type: 'keyDown',
      key: 'w',
      code: 'KeyW',
      isAutoRepeat: false,
      shift: false,
      control: false,
      alt: false,
      meta: false,
    })).toBe('KeyW');
  });

  it('includes browser find shortcuts without duplicating existing bindings', () => {
    expect(includeWebviewFindShortcuts(['meta+KeyT', 'meta+KeyF'])).toEqual([
      'ctrl+KeyF',
      'meta+KeyF',
      'meta+KeyT',
    ]);
  });

  it('recognizes the platform find modifiers without consuming modified variants', () => {
    const base = {
      type: 'keyDown',
      key: 'f',
      code: 'KeyF',
      isAutoRepeat: false,
      shift: false,
      control: false,
      alt: false,
      meta: true,
    };

    expect(isWebviewFindShortcut(base)).toBe(true);
    expect(isWebviewFindShortcut({ ...base, meta: false, control: true })).toBe(true);
    expect(isWebviewFindShortcut({ ...base, shift: true })).toBe(false);
    expect(isWebviewFindShortcut({ ...base, control: true })).toBe(false);
  });
});
