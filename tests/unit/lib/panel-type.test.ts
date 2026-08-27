import { describe, expect, it } from 'vitest';
import { getPanelTmuxSession, isVirtualPanelType, panelUsesTmux } from '@/lib/panel-type';

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

  it('excludes virtual panel session names from tmux-backed API targets', () => {
    const syntheticSession = 'pt-ws-test-pane-test-tab-test';

    expect(getPanelTmuxSession('web-browser', syntheticSession)).toBeNull();
    expect(getPanelTmuxSession('document-editor', syntheticSession)).toBeNull();
    expect(getPanelTmuxSession('terminal', syntheticSession)).toBe(syntheticSession);
  });
});
