import { describe, expect, it } from 'vitest';
import {
  getOrchestratorTabId,
  isOrchestratorTab,
  isOrchestratorWorkspace,
} from '@/lib/workspace-team-role';
import type { IWorkspaceGroup } from '@/types/terminal';

const groups: IWorkspaceGroup[] = [
  { id: 'plain', name: 'Plain' },
  {
    id: 'team',
    name: 'Team',
    team: {
      orchestrator: { workspaceId: 'control', tabId: 'control-tab' },
    },
  },
];

describe('workspace team roles', () => {
  it('resolves the configured orchestrator workspace and tab', () => {
    expect(getOrchestratorTabId(groups, 'control')).toBe('control-tab');
    expect(isOrchestratorWorkspace(groups, 'control')).toBe(true);
    expect(isOrchestratorTab(groups, 'control', 'control-tab')).toBe(true);
  });

  it('does not mark workers or other tabs as orchestrators', () => {
    expect(getOrchestratorTabId(groups, 'worker')).toBeNull();
    expect(isOrchestratorWorkspace(groups, 'worker')).toBe(false);
    expect(isOrchestratorTab(groups, 'control', 'other-tab')).toBe(false);
  });
});
