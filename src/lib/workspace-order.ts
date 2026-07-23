import type { IWorkspace, IWorkspaceGroup, TWorkspaceSidebarItem } from '@/types/terminal';

export const normalizeWorkspaceSidebarOrder = (
  workspaces: IWorkspace[],
  groups: IWorkspaceGroup[],
  sidebarOrder?: TWorkspaceSidebarItem[],
): TWorkspaceSidebarItem[] => {
  const groupIds = new Set(groups.map((group) => group.id));
  const ungroupedIds = new Set(
    workspaces.filter((workspace) => !workspace.groupId || !groupIds.has(workspace.groupId)).map((workspace) => workspace.id),
  );
  const seenGroups = new Set<string>();
  const seenWorkspaces = new Set<string>();
  const normalized: TWorkspaceSidebarItem[] = [];

  for (const item of sidebarOrder ?? []) {
    if (item.type === 'group') {
      if (!groupIds.has(item.id) || seenGroups.has(item.id)) continue;
      seenGroups.add(item.id);
      normalized.push({ type: 'group', id: item.id });
      continue;
    }
    if (!ungroupedIds.has(item.id) || seenWorkspaces.has(item.id)) continue;
    seenWorkspaces.add(item.id);
    normalized.push({ type: 'workspace', id: item.id });
  }

  // Existing installations rendered every group before ungrouped workspaces.
  // Appending missing entries in that order preserves the old layout during migration.
  for (const group of groups) {
    if (seenGroups.has(group.id)) continue;
    seenGroups.add(group.id);
    normalized.push({ type: 'group', id: group.id });
  }
  for (const workspace of workspaces) {
    if (!ungroupedIds.has(workspace.id) || seenWorkspaces.has(workspace.id)) continue;
    seenWorkspaces.add(workspace.id);
    normalized.push({ type: 'workspace', id: workspace.id });
  }

  return normalized;
};

export const getVisuallyOrderedWorkspaces = (
  workspaces: IWorkspace[],
  groups: IWorkspaceGroup[],
  sidebarOrder?: TWorkspaceSidebarItem[],
): IWorkspace[] => {
  const validGroupIds = new Set(groups.map((g) => g.id));
  const byGroup = new Map<string, IWorkspace[]>();

  for (const ws of workspaces) {
    const gid = ws.groupId ?? null;
    if (gid && validGroupIds.has(gid)) {
      const list = byGroup.get(gid) ?? [];
      list.push(ws);
      byGroup.set(gid, list);
    }
  }

  const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  const ordered: IWorkspace[] = [];
  for (const item of normalizeWorkspaceSidebarOrder(workspaces, groups, sidebarOrder)) {
    if (item.type === 'group') {
      const list = byGroup.get(item.id);
      if (list) ordered.push(...list);
      continue;
    }
    const workspace = workspaceById.get(item.id);
    if (workspace) ordered.push(workspace);
  }
  return ordered;
};
