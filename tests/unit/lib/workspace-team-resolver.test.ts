import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  data: {
    workspaces: [
      { id: 'ws-orch', name: 'Orchestrator', directories: ['/orch'], groupId: 'grp-team' },
      { id: 'ws-auto', name: 'Auto Worker', directories: ['/auto'], groupId: 'grp-child' },
      { id: 'ws-override', name: 'Override Worker', directories: ['/override'], groupId: 'grp-team' },
      { id: 'ws-empty', name: 'Empty Worker', directories: ['/empty'], groupId: 'grp-team' },
    ],
    groups: [
      {
        id: 'grp-team',
        name: 'Product',
        team: {
          orchestrator: { workspaceId: 'ws-orch', tabId: 'tab-orch' },
          workerTabOverrides: { 'ws-override': 'tab-override-2' },
        },
      },
      { id: 'grp-child', name: 'Backend', parentId: 'grp-team' },
    ],
    sidebarOrder: [],
    sidebarCollapsed: false,
    sidebarWidth: 240,
  },
  layouts: {
    'ws-orch': {
      root: {
        type: 'pane', id: 'pane-orch', activeTabId: 'tab-orch', tabs: [
          { id: 'tab-orch', name: 'Claude', order: 0, panelType: 'claude-code', sessionName: 'session-orch' },
        ],
      },
      activePaneId: 'pane-orch', updatedAt: '',
    },
    'ws-auto': {
      root: {
        type: 'pane', id: 'pane-auto', activeTabId: 'tab-auto', tabs: [
          { id: 'tab-terminal', name: 'Shell', order: 0, panelType: 'terminal', sessionName: 'session-terminal' },
          { id: 'tab-auto', name: 'Codex', order: 1, panelType: 'codex-cli', sessionName: 'session-auto' },
        ],
      },
      activePaneId: 'pane-auto', updatedAt: '',
    },
    'ws-override': {
      root: {
        type: 'pane', id: 'pane-override', activeTabId: 'tab-override-1', tabs: [
          { id: 'tab-override-1', name: 'First', order: 0, panelType: 'claude-code', sessionName: 'session-override-1' },
          { id: 'tab-override-2', name: 'Second', order: 1, panelType: 'codex-cli', sessionName: 'session-override-2' },
        ],
      },
      activePaneId: 'pane-override', updatedAt: '',
    },
    'ws-empty': {
      root: {
        type: 'pane', id: 'pane-empty', activeTabId: 'tab-empty', tabs: [
          { id: 'tab-empty', name: 'Shell', order: 0, panelType: 'terminal', sessionName: 'session-empty' },
        ],
      },
      activePaneId: 'pane-empty', updatedAt: '',
    },
  } as Record<string, unknown>,
}));

vi.mock('@/lib/workspace-store', () => ({
  getWorkspaces: vi.fn(async () => fixtures.data),
}));

vi.mock('@/lib/layout-store', () => ({
  getLayout: vi.fn(async (workspaceId: string) => fixtures.layouts[workspaceId]),
}));

import {
  resolveWorkspaceTeam,
  resolveWorkspaceTeamContext,
  validateWorkspaceTeamConfig,
} from '@/lib/workspace-team';

describe('workspace team resolver', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses an explicit orchestrator, automatic workers, overrides, and unavailable entries', async () => {
    const team = await resolveWorkspaceTeam('grp-team', 'session-override-2');

    expect(team?.orchestrator?.tabId).toBe('tab-orch');
    expect(team?.workers.map((worker) => [worker.workspaceId, worker.tabId, worker.selection])).toEqual([
      ['ws-auto', 'tab-auto', 'automatic'],
      ['ws-override', 'tab-override-2', 'configured'],
      ['ws-empty', null, 'unavailable'],
    ]);
    expect(team?.currentRole).toBe('worker');
    expect(team?.currentMember?.workspaceId).toBe('ws-override');
  });

  it('rejects an orchestrator tab outside the eligible group tabs', async () => {
    await expect(validateWorkspaceTeamConfig('grp-team', {
      orchestrator: { workspaceId: 'ws-orch', tabId: 'missing' },
    })).resolves.toMatch('Orchestrator');
  });

  it('resolves a parent agent team from a nested workspace', async () => {
    const team = await resolveWorkspaceTeamContext({
      workspaceId: 'ws-auto',
      sessionName: 'session-auto',
    });

    expect(team?.groupId).toBe('grp-team');
    expect(team?.currentRole).toBe('worker');
  });
});
