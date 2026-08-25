import { describe, expect, it } from 'vitest';
import { isVirtualPanelType, panelUsesTmux } from '@/lib/panel-type';

describe('panel type capabilities', () => {
  it('does not allocate tmux sessions for browser and document panels', () => {
    expect(panelUsesTmux('web-browser')).toBe(false);
    expect(panelUsesTmux('document-editor')).toBe(false);
    expect(isVirtualPanelType('document-editor')).toBe(true);
  });

  it('keeps terminals and agent panels tmux-backed', () => {
    expect(panelUsesTmux('terminal')).toBe(true);
    expect(panelUsesTmux('claude-code')).toBe(true);
    expect(panelUsesTmux('codex-cli')).toBe(true);
    expect(panelUsesTmux(undefined)).toBe(true);
  });
});
