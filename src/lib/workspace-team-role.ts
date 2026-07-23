import type { IWorkspaceGroup } from '@/types/terminal';

export const getOrchestratorTabId = (
  groups: IWorkspaceGroup[],
  workspaceId: string | null | undefined,
): string | null => {
  if (!workspaceId) return null;
  return groups.find((group) => group.team?.orchestrator.workspaceId === workspaceId)
    ?.team?.orchestrator.tabId ?? null;
};

export const isOrchestratorWorkspace = (
  groups: IWorkspaceGroup[],
  workspaceId: string,
): boolean => getOrchestratorTabId(groups, workspaceId) !== null;

export const isOrchestratorTab = (
  groups: IWorkspaceGroup[],
  workspaceId: string,
  tabId: string,
): boolean => getOrchestratorTabId(groups, workspaceId) === tabId;
