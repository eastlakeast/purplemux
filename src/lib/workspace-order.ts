import type { IWorkspace, IWorkspaceGroup, TWorkspaceSidebarItem } from '@/types/terminal';

export interface IWorkspaceHierarchy {
  workspaces: IWorkspace[];
  groups: IWorkspaceGroup[];
  sidebarOrder: TWorkspaceSidebarItem[];
}

const normalizeContainerOrder = (
  childGroups: IWorkspaceGroup[],
  childWorkspaces: IWorkspace[],
  order?: TWorkspaceSidebarItem[],
): TWorkspaceSidebarItem[] => {
  const groupIds = new Set(childGroups.map((group) => group.id));
  const workspaceIds = new Set(childWorkspaces.map((workspace) => workspace.id));
  const seenGroups = new Set<string>();
  const seenWorkspaces = new Set<string>();
  const normalized: TWorkspaceSidebarItem[] = [];

  for (const item of order ?? []) {
    if (item.type === 'group') {
      if (!groupIds.has(item.id) || seenGroups.has(item.id)) continue;
      seenGroups.add(item.id);
      normalized.push({ type: 'group', id: item.id });
      continue;
    }
    if (!workspaceIds.has(item.id) || seenWorkspaces.has(item.id)) continue;
    seenWorkspaces.add(item.id);
    normalized.push({ type: 'workspace', id: item.id });
  }

  for (const group of childGroups) {
    if (seenGroups.has(group.id)) continue;
    seenGroups.add(group.id);
    normalized.push({ type: 'group', id: group.id });
  }
  for (const workspace of childWorkspaces) {
    if (seenWorkspaces.has(workspace.id)) continue;
    seenWorkspaces.add(workspace.id);
    normalized.push({ type: 'workspace', id: workspace.id });
  }

  return normalized;
};

const sanitizeGroupParents = (groups: IWorkspaceGroup[]): IWorkspaceGroup[] => {
  const clones = groups.map((group) => ({ ...group }));
  const byId = new Map(clones.map((group) => [group.id, group]));
  for (const group of clones) {
    if (!group.parentId || group.parentId === group.id || !byId.has(group.parentId)) {
      group.parentId = null;
    }
  }
  for (const group of clones) {
    const seen = new Set([group.id]);
    let parentId = group.parentId ?? null;
    while (parentId) {
      if (seen.has(parentId)) {
        group.parentId = null;
        break;
      }
      seen.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
  }
  return clones;
};

export const normalizeWorkspaceHierarchy = (
  workspaces: IWorkspace[],
  groups: IWorkspaceGroup[],
  sidebarOrder?: TWorkspaceSidebarItem[],
): IWorkspaceHierarchy => {
  const normalizedGroups = sanitizeGroupParents(groups);
  const groupIds = new Set(normalizedGroups.map((group) => group.id));
  const normalizedWorkspaces = workspaces.map((workspace) => ({
    ...workspace,
    groupId: workspace.groupId && groupIds.has(workspace.groupId) ? workspace.groupId : null,
  }));

  const groupsByParent = new Map<string | null, IWorkspaceGroup[]>();
  for (const group of normalizedGroups) {
    const parentId = group.parentId ?? null;
    const children = groupsByParent.get(parentId) ?? [];
    children.push(group);
    groupsByParent.set(parentId, children);
  }
  const workspacesByGroup = new Map<string | null, IWorkspace[]>();
  for (const workspace of normalizedWorkspaces) {
    const groupId = workspace.groupId ?? null;
    const children = workspacesByGroup.get(groupId) ?? [];
    children.push(workspace);
    workspacesByGroup.set(groupId, children);
  }

  const rootOrder = normalizeContainerOrder(
    groupsByParent.get(null) ?? [],
    workspacesByGroup.get(null) ?? [],
    sidebarOrder,
  );
  for (const group of normalizedGroups) {
    group.childOrder = normalizeContainerOrder(
      groupsByParent.get(group.id) ?? [],
      workspacesByGroup.get(group.id) ?? [],
      group.childOrder,
    );
  }

  return {
    workspaces: normalizedWorkspaces,
    groups: normalizedGroups,
    sidebarOrder: rootOrder,
  };
};

export const normalizeWorkspaceSidebarOrder = (
  workspaces: IWorkspace[],
  groups: IWorkspaceGroup[],
  sidebarOrder?: TWorkspaceSidebarItem[],
): TWorkspaceSidebarItem[] => normalizeWorkspaceHierarchy(workspaces, groups, sidebarOrder).sidebarOrder;

export const getWorkspaceGroupDescendantIds = (
  groups: IWorkspaceGroup[],
  groupId: string,
): Set<string> => {
  const descendants = new Set([groupId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const group of groups) {
      if (group.parentId && descendants.has(group.parentId) && !descendants.has(group.id)) {
        descendants.add(group.id);
        changed = true;
      }
    }
  }
  return descendants;
};

export const getWorkspaceGroupWorkspaceCount = (
  workspaces: IWorkspace[],
  groups: IWorkspaceGroup[],
  groupId: string,
): number => {
  const descendants = getWorkspaceGroupDescendantIds(groups, groupId);
  return workspaces.filter((workspace) => workspace.groupId && descendants.has(workspace.groupId)).length;
};

export const getVisuallyOrderedWorkspaces = (
  workspaces: IWorkspace[],
  groups: IWorkspaceGroup[],
  sidebarOrder?: TWorkspaceSidebarItem[],
): IWorkspace[] => {
  const hierarchy = normalizeWorkspaceHierarchy(workspaces, groups, sidebarOrder);
  const workspaceById = new Map(hierarchy.workspaces.map((workspace) => [workspace.id, workspace]));
  const groupById = new Map(hierarchy.groups.map((group) => [group.id, group]));
  const ordered: IWorkspace[] = [];

  const visit = (items: TWorkspaceSidebarItem[]) => {
    for (const item of items) {
      if (item.type === 'workspace') {
        const workspace = workspaceById.get(item.id);
        if (workspace) ordered.push(workspace);
        continue;
      }
      const group = groupById.get(item.id);
      if (group) visit(group.childOrder ?? []);
    }
  };
  visit(hierarchy.sidebarOrder);
  return ordered;
};

const getContainerOrder = (
  groups: IWorkspaceGroup[],
  sidebarOrder: TWorkspaceSidebarItem[],
  parentGroupId: string | null,
): TWorkspaceSidebarItem[] =>
  parentGroupId
    ? groups.find((group) => group.id === parentGroupId)?.childOrder ?? []
    : sidebarOrder;

export const moveWorkspaceHierarchyItem = (
  workspaces: IWorkspace[],
  groups: IWorkspaceGroup[],
  sidebarOrder: TWorkspaceSidebarItem[],
  item: TWorkspaceSidebarItem,
  targetParentGroupId: string | null,
  targetIndex: number,
): IWorkspaceHierarchy | null => {
  const hierarchy = normalizeWorkspaceHierarchy(workspaces, groups, sidebarOrder);
  if (targetParentGroupId && !hierarchy.groups.some((group) => group.id === targetParentGroupId)) return null;

  const sourceWorkspace = item.type === 'workspace'
    ? hierarchy.workspaces.find((workspace) => workspace.id === item.id)
    : null;
  const sourceGroup = item.type === 'group'
    ? hierarchy.groups.find((group) => group.id === item.id)
    : null;
  if (!sourceWorkspace && !sourceGroup) return null;
  if (sourceGroup && targetParentGroupId && getWorkspaceGroupDescendantIds(hierarchy.groups, sourceGroup.id).has(targetParentGroupId)) {
    return null;
  }

  const sourceParentId = sourceWorkspace?.groupId ?? sourceGroup?.parentId ?? null;
  const sourceOrder = getContainerOrder(hierarchy.groups, hierarchy.sidebarOrder, sourceParentId);
  const sourceIndex = sourceOrder.findIndex((candidate) => candidate.type === item.type && candidate.id === item.id);
  if (sourceIndex < 0) return null;

  const nextGroups = hierarchy.groups.map((group) => ({
    ...group,
    childOrder: [...(group.childOrder ?? [])],
  }));
  const nextWorkspaces = hierarchy.workspaces.map((workspace) => ({ ...workspace }));
  const nextRoot = [...hierarchy.sidebarOrder];
  const mutableContainer = (parentId: string | null): TWorkspaceSidebarItem[] => {
    if (!parentId) return nextRoot;
    return nextGroups.find((group) => group.id === parentId)!.childOrder!;
  };
  const mutableSource = mutableContainer(sourceParentId);
  mutableSource.splice(sourceIndex, 1);
  const mutableTarget = mutableContainer(targetParentGroupId);
  const adjustedTargetIndex = sourceParentId === targetParentGroupId && sourceIndex < targetIndex
    ? targetIndex - 1
    : targetIndex;
  mutableTarget.splice(Math.max(0, Math.min(adjustedTargetIndex, mutableTarget.length)), 0, item);

  if (sourceWorkspace) {
    nextWorkspaces.find((workspace) => workspace.id === sourceWorkspace.id)!.groupId = targetParentGroupId;
  } else if (sourceGroup) {
    nextGroups.find((group) => group.id === sourceGroup.id)!.parentId = targetParentGroupId;
  }

  const normalized = normalizeWorkspaceHierarchy(nextWorkspaces, nextGroups, nextRoot);
  normalized.workspaces = getVisuallyOrderedWorkspaces(
    normalized.workspaces,
    normalized.groups,
    normalized.sidebarOrder,
  );
  return normalized;
};

export const removeWorkspaceGroupFromHierarchy = (
  workspaces: IWorkspace[],
  groups: IWorkspaceGroup[],
  sidebarOrder: TWorkspaceSidebarItem[],
  groupId: string,
): IWorkspaceHierarchy | null => {
  const hierarchy = normalizeWorkspaceHierarchy(workspaces, groups, sidebarOrder);
  const target = hierarchy.groups.find((group) => group.id === groupId);
  if (!target) return null;
  const parentId = target.parentId ?? null;
  const nextGroups = hierarchy.groups
    .filter((group) => group.id !== groupId)
    .map((group) => group.parentId === groupId ? { ...group, parentId } : { ...group });
  const nextWorkspaces = hierarchy.workspaces.map((workspace) =>
    workspace.groupId === groupId ? { ...workspace, groupId: parentId } : { ...workspace },
  );
  const nextRoot = [...hierarchy.sidebarOrder];
  const parentOrder = parentId
    ? nextGroups.find((group) => group.id === parentId)?.childOrder
    : nextRoot;
  if (!parentOrder) return null;
  const index = parentOrder.findIndex((item) => item.type === 'group' && item.id === groupId);
  if (index >= 0) parentOrder.splice(index, 1, ...(target.childOrder ?? []));

  const normalized = normalizeWorkspaceHierarchy(nextWorkspaces, nextGroups, nextRoot);
  normalized.workspaces = getVisuallyOrderedWorkspaces(
    normalized.workspaces,
    normalized.groups,
    normalized.sidebarOrder,
  );
  return normalized;
};
