import { describe, expect, it } from 'vitest';
import { normalizeWebviewKeyboardInput } from '@/lib/webview-keyboard';

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
});
