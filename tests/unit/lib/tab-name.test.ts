import { describe, expect, it } from 'vitest';
import {
  defaultTabNameForPanelType,
  resolveTabNameForPanelTypeChange,
} from '@/lib/tab-name';

describe('tab names', () => {
  it('does not persist the session list label as a tab name', () => {
    expect(defaultTabNameForPanelType('agent-sessions')).toBe('');
    expect(defaultTabNameForPanelType('web-browser')).toBe('Web Browser');
    expect(defaultTabNameForPanelType('document-editor')).toBe('Document');
    expect(defaultTabNameForPanelType('codex-cli')).toBe('');
  });

  it('clears a session list default name when switching to Codex', () => {
    expect(resolveTabNameForPanelTypeChange('Session List', 'agent-sessions', 'codex-cli')).toBe('');
  });

  it('keeps custom names when switching panel type', () => {
    expect(resolveTabNameForPanelTypeChange('My Session List', 'agent-sessions', 'codex-cli')).toBe('My Session List');
  });

  it('keeps names empty when switching from an unnamed tab to session list', () => {
    expect(resolveTabNameForPanelTypeChange('', 'codex-cli', 'agent-sessions')).toBe('');
  });
});
