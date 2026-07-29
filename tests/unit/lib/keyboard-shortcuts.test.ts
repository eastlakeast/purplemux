import { describe, expect, it } from 'vitest';
import {
  formatHotkeyForDisplay,
  getResolvedKey,
  matchesAction,
} from '@/lib/keyboard-shortcuts';

describe('terminal panel shortcut', () => {
  it('uses Ctrl+Shift+Backquote by default', () => {
    expect(getResolvedKey('panel.toggle_terminal')).toBe('ctrl+shift+Backquote');
  });

  it('matches the physical Backquote key with Ctrl and Shift', () => {
    const event = {
      code: 'Backquote',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: true,
    } as KeyboardEvent;

    expect(matchesAction(event, 'panel.toggle_terminal')).toBe(true);
  });

  it('formats Backquote as the key glyph', () => {
    expect(formatHotkeyForDisplay('ctrl+shift+Backquote')).toEqual({
      mac: '⌃⇧`',
      other: 'Ctrl+Shift+`',
    });
  });
});
