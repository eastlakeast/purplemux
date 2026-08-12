import { getLayout } from '@/lib/layout-store';
import { collectPanes } from '@/lib/layout-tree';
import { getWorkspaces } from '@/lib/workspace-store';
import { getWorkspaceGroupDescendantIds } from '@/lib/workspace-order';
import type {
  ITab,
  IWorkspace,
  IWorkspaceGroup,
  IWorkspaceTeamConfig,
  TPanelType,
} from '@/types/terminal';
import type { TCliState } from '@/types/timeline';

export type TWorkspaceTeamRole = 'orchestrator' | 'worker' | 'observer';
export type TWorkspaceTeamSelection = 'configured' | 'automatic' | 'unavailable';

export interface IWorkspaceTeamTabOption {
  tabId: string;
  tabName: string;
  panelType: TPanelType;
  sessionName: string;
  cliState?: TCliState;
}

export interface IWorkspaceTeamWorkspaceOption {
  workspaceId: string;
  workspaceName: string;
  tabs: IWorkspaceTeamTabOption[];
}

export interface IResolvedWorkspaceTeamMember {
  role: Exclude<TWorkspaceTeamRole, 'observer'>;
  alias: string;
  workspaceId: string;
  workspaceName: string;
  tabId: string | null;
  tabName: string | null;
  panelType: TPanelType | null;
  sessionName: string | null;
  cliState: TCliState | null;
  selection: TWorkspaceTeamSelection;
}

export interface IResolvedWorkspaceTeam {
  groupId: string;
  groupName: string;
  orchestrator: IResolvedWorkspaceTeamMember | null;
  workers: IResolvedWorkspaceTeamMember[];
  currentRole: TWorkspaceTeamRole;
  currentMember: IResolvedWorkspaceTeamMember | null;
}

interface IWorkspaceTeamSource {
  group: IWorkspaceGroup;
  workspaces: IWorkspace[];
  options: IWorkspaceTeamWorkspaceOption[];
}

export const isWorkspaceTeamAgentTab = (tab: Pick<ITab, 'panelType'>): boolean =>
  tab.panelType === 'claude-code' || tab.panelType === 'codex-cli';

const toTabOption = (tab: ITab): IWorkspaceTeamTabOption => ({
  tabId: tab.id,
  tabName: tab.name || tab.title || tab.panelType || tab.id,
  panelType: tab.panelType as TPanelType,
  sessionName: tab.sessionName,
  cliState: tab.cliState,
});

const makeBaseAlias = (workspace: IWorkspace, index: number): string => {
  const alias = workspace.name
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return alias || `worker-${index + 1}`;
};

export const buildWorkspaceTeamAliases = (workspaces: IWorkspace[]): Map<string, string> => {
  const aliases = new Map<string, string>();
  const counts = new Map<string, number>();
  workspaces.forEach((workspace, index) => {
    const base = makeBaseAlias(workspace, index);
    const count = (counts.get(base) ?? 0) + 1;
    counts.set(base, count);
    aliases.set(workspace.id, count === 1 ? base : `${base}-${count}`);
  });
  return aliases;
};

export const findWorkspaceAgentTeamGroupId = (
  groups: IWorkspaceGroup[],
  workspaceGroupId: string,
): string | null => {
  const groupById = new Map(groups.map((group) => [group.id, group]));
  let groupId: string | null = workspaceGroupId;
  while (groupId) {
    const group = groupById.get(groupId);
    if (!group) return null;
    if (group.team) return group.id;
    groupId = group.parentId ?? null;
  }
  return null;
};

const loadWorkspaceTeamSource = async (groupId: string): Promise<IWorkspaceTeamSource | null> => {
  const data = await getWorkspaces();
  const group = data.groups.find((candidate) => candidate.id === groupId);
  if (!group) return null;
  const descendantIds = getWorkspaceGroupDescendantIds(data.groups, groupId);
  const workspaces = data.workspaces.filter(
    (workspace) => workspace.groupId && descendantIds.has(workspace.groupId),
  );
  const options = await Promise.all(workspaces.map(async (workspace) => {
    const layout = await getLayout(workspace.id, workspace.directories[0]);
    const tabs = collectPanes(layout.root)
      .flatMap((pane) => [...pane.tabs].sort((a, b) => a.order - b.order))
      .filter(isWorkspaceTeamAgentTab)
      .map(toTabOption);
    return {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      tabs,
    };
  }));
  return { group, workspaces, options };
};

export const getWorkspaceTeamOptions = async (
  groupId: string,
): Promise<IWorkspaceTeamWorkspaceOption[] | null> => {
  const source = await loadWorkspaceTeamSource(groupId);
  return source?.options ?? null;
};

const findTabOption = (
  options: IWorkspaceTeamWorkspaceOption[],
  workspaceId: string,
  tabId: string,
): IWorkspaceTeamTabOption | null =>
  options.find((option) => option.workspaceId === workspaceId)
    ?.tabs.find((tab) => tab.tabId === tabId) ?? null;

export const validateWorkspaceTeamConfig = async (
  groupId: string,
  config: IWorkspaceTeamConfig,
): Promise<string | null> => {
  const source = await loadWorkspaceTeamSource(groupId);
  if (!source) return 'Group not found';
  if (!findTabOption(source.options, config.orchestrator.workspaceId, config.orchestrator.tabId)) {
    return 'Orchestrator must be a Claude Code or Codex tab in this group';
  }
  for (const [workspaceId, tabId] of Object.entries(config.workerTabOverrides ?? {})) {
    if (workspaceId === config.orchestrator.workspaceId) {
      return 'The orchestrator workspace cannot also be a worker';
    }
    if (!findTabOption(source.options, workspaceId, tabId)) {
      return `Worker tab not found in workspace ${workspaceId}`;
    }
  }
  return null;
};

const createMember = (
  role: IResolvedWorkspaceTeamMember['role'],
  workspace: IWorkspace,
  alias: string,
  tab: IWorkspaceTeamTabOption | null,
  selection: TWorkspaceTeamSelection,
): IResolvedWorkspaceTeamMember => ({
  role,
  alias,
  workspaceId: workspace.id,
  workspaceName: workspace.name,
  tabId: tab?.tabId ?? null,
  tabName: tab?.tabName ?? null,
  panelType: tab?.panelType ?? null,
  sessionName: tab?.sessionName ?? null,
  cliState: tab?.cliState ?? null,
  selection,
});

const resolveSource = (
  source: IWorkspaceTeamSource,
  currentSessionName?: string,
): IResolvedWorkspaceTeam | null => {
  const config = source.group.team;
  if (!config) return null;
  const aliases = buildWorkspaceTeamAliases(source.workspaces);
  const orchestratorWorkspace = source.workspaces.find(
    (workspace) => workspace.id === config.orchestrator.workspaceId,
  );
  const orchestratorTab = findTabOption(
    source.options,
    config.orchestrator.workspaceId,
    config.orchestrator.tabId,
  );
  const orchestrator = orchestratorWorkspace && orchestratorTab
    ? createMember(
        'orchestrator',
        orchestratorWorkspace,
        aliases.get(orchestratorWorkspace.id)!,
        orchestratorTab,
        'configured',
      )
    : null;

  const workers = source.workspaces
    .filter((workspace) => workspace.id !== config.orchestrator.workspaceId)
    .map((workspace) => {
      const option = source.options.find((candidate) => candidate.workspaceId === workspace.id)!;
      const overrideId = config.workerTabOverrides?.[workspace.id];
      const override = overrideId
        ? option.tabs.find((tab) => tab.tabId === overrideId) ?? null
        : null;
      const tab = override ?? option.tabs[0] ?? null;
      return createMember(
        'worker',
        workspace,
        aliases.get(workspace.id)!,
        tab,
        tab ? (override ? 'configured' : 'automatic') : 'unavailable',
      );
    });

  const currentMember = currentSessionName
    ? [orchestrator, ...workers].find((member) => member?.sessionName === currentSessionName) ?? null
    : null;
  return {
    groupId: source.group.id,
    groupName: source.group.name,
    orchestrator,
    workers,
    currentRole: currentMember?.role ?? 'observer',
    currentMember,
  };
};

export const resolveWorkspaceTeam = async (
  groupId: string,
  currentSessionName?: string,
): Promise<IResolvedWorkspaceTeam | null> => {
  const source = await loadWorkspaceTeamSource(groupId);
  return source ? resolveSource(source, currentSessionName) : null;
};

export const resolveWorkspaceTeamContext = async (context: {
  workspaceId?: string;
  sessionName?: string;
}): Promise<IResolvedWorkspaceTeam | null> => {
  const data = await getWorkspaces();
  let workspace = context.workspaceId
    ? data.workspaces.find((candidate) => candidate.id === context.workspaceId)
    : undefined;

  if (!workspace && context.sessionName) {
    for (const candidate of data.workspaces) {
      const layout = await getLayout(candidate.id, candidate.directories[0]);
      const found = collectPanes(layout.root)
        .some((pane) => pane.tabs.some((tab) => tab.sessionName === context.sessionName));
      if (found) {
        workspace = candidate;
        break;
      }
    }
  }

  if (!workspace?.groupId) return null;
  const teamGroupId = findWorkspaceAgentTeamGroupId(data.groups, workspace.groupId);
  return teamGroupId ? resolveWorkspaceTeam(teamGroupId, context.sessionName) : null;
};

export const matchWorkspaceTeamMembers = (
  team: IResolvedWorkspaceTeam,
  target: string,
  workersOnly = false,
): IResolvedWorkspaceTeamMember[] => {
  const members = workersOnly
    ? team.workers
    : [team.orchestrator, ...team.workers].filter((member): member is IResolvedWorkspaceTeamMember => Boolean(member));
  const normalized = target.trim().toLocaleLowerCase();
  return members.filter((member) =>
    member.alias.toLocaleLowerCase() === normalized ||
    member.workspaceId.toLocaleLowerCase() === normalized ||
    member.tabId?.toLocaleLowerCase() === normalized ||
    member.workspaceName.toLocaleLowerCase() === normalized,
  );
};
