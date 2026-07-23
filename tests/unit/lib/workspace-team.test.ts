import { describe, expect, it } from 'vitest';
import {
  buildWorkspaceTeamAliases,
  findWorkspaceAgentTeamGroupId,
  matchWorkspaceTeamMembers,
  type IResolvedWorkspaceTeam,
} from '@/lib/workspace-team';
import type { IWorkspace, IWorkspaceGroup } from '@/types/terminal';

const workspaces: IWorkspace[] = [
  { id: 'ws-one', name: 'AIOS Backend', directories: ['/one'] },
  { id: 'ws-two', name: 'AIOS Backend', directories: ['/two'] },
  { id: 'ws-three', name: '퍼플 인증', directories: ['/three'] },
];

const team: IResolvedWorkspaceTeam = {
  groupId: 'grp-one',
  groupName: 'Product',
  orchestrator: {
    role: 'orchestrator',
    alias: 'orchestrator',
    workspaceId: 'ws-orchestrator',
    workspaceName: 'Orchestrator',
    tabId: 'tab-orchestrator',
    tabName: 'Claude',
    panelType: 'claude-code',
    sessionName: 'session-orchestrator',
    selection: 'configured',
  },
  workers: [
    {
      role: 'worker',
      alias: 'aios-backend',
      workspaceId: 'ws-one',
      workspaceName: 'AIOS Backend',
      tabId: 'tab-one',
      tabName: 'Codex',
      panelType: 'codex-cli',
      sessionName: 'session-one',
      selection: 'automatic',
    },
  ],
  currentRole: 'observer',
  currentMember: null,
};

describe('workspace agent team', () => {
  it('creates shell-friendly aliases and disambiguates duplicate names', () => {
    expect(Object.fromEntries(buildWorkspaceTeamAliases(workspaces))).toEqual({
      'ws-one': 'aios-backend',
      'ws-two': 'aios-backend-2',
      'ws-three': '퍼플-인증',
    });
  });

  it('matches a member by alias, workspace ID, tab ID, or workspace name', () => {
    expect(matchWorkspaceTeamMembers(team, 'aios-backend')[0]?.workspaceId).toBe('ws-one');
    expect(matchWorkspaceTeamMembers(team, 'ws-one')[0]?.workspaceId).toBe('ws-one');
    expect(matchWorkspaceTeamMembers(team, 'tab-one')[0]?.workspaceId).toBe('ws-one');
    expect(matchWorkspaceTeamMembers(team, 'AIOS Backend')[0]?.workspaceId).toBe('ws-one');
  });

  it('can restrict dispatch targets to workers', () => {
    expect(matchWorkspaceTeamMembers(team, 'orchestrator', true)).toEqual([]);
  });

  it('inherits the nearest configured agent team from parent groups', () => {
    const groups: IWorkspaceGroup[] = [
      { id: 'root', name: 'Root', team: { orchestrator: { workspaceId: 'a', tabId: 'ta' } } },
      { id: 'child', name: 'Child', parentId: 'root' },
      {
        id: 'nested-team',
        name: 'Nested team',
        parentId: 'child',
        team: { orchestrator: { workspaceId: 'b', tabId: 'tb' } },
      },
    ];

    expect(findWorkspaceAgentTeamGroupId(groups, 'child')).toBe('root');
    expect(findWorkspaceAgentTeamGroupId(groups, 'nested-team')).toBe('nested-team');
  });
});
