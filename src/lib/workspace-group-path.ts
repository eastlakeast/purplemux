import type { IWorkspaceGroup, TWorkspaceSidebarItem } from '@/types/terminal';

export const parseWorkspaceGroupPath = (groupPath: string): string[] => {
  const trimmed = groupPath.trim();
  if (!trimmed) return [];

  const segments = trimmed.split('/').map((segment) => segment.trim());
  if (segments.some((segment) => !segment)) {
    throw new Error('groupPath must be a slash-separated path with non-empty group names');
  }
  return segments;
};

export const ensureWorkspaceGroupPath = (
  groups: IWorkspaceGroup[],
  sidebarOrder: TWorkspaceSidebarItem[],
  segments: string[],
  createId: () => string,
): { groups: IWorkspaceGroup[]; sidebarOrder: TWorkspaceSidebarItem[]; groupId: string | null } => {
  const nextGroups: IWorkspaceGroup[] = groups.map((group) => ({
    ...group,
    childOrder: [...(group.childOrder ?? [])],
  }));
  const nextSidebarOrder = [...sidebarOrder];
  let parentId: string | null = null;

  for (const name of segments) {
    const existing = nextGroups.find(
      (group) => (group.parentId ?? null) === parentId && group.name === name,
    );
    if (existing) {
      parentId = existing.id;
      continue;
    }

    const group: IWorkspaceGroup = {
      id: createId(),
      name,
      collapsed: false,
      parentId,
      childOrder: [],
    };
    nextGroups.push(group);

    const container = parentId
      ? nextGroups.find((candidate) => candidate.id === parentId)?.childOrder
      : nextSidebarOrder;
    container?.push({ type: 'group', id: group.id });
    parentId = group.id;
  }

  return { groups: nextGroups, sidebarOrder: nextSidebarOrder, groupId: parentId };
};

export const getWorkspaceGroupPath = (
  groups: IWorkspaceGroup[],
  groupId: string | null | undefined,
): string | null => {
  if (!groupId) return null;

  const byId = new Map(groups.map((group) => [group.id, group]));
  const names: string[] = [];
  const seen = new Set<string>();
  let currentId: string | null = groupId;

  while (currentId) {
    if (seen.has(currentId)) return null;
    seen.add(currentId);
    const group = byId.get(currentId);
    if (!group) return null;
    names.push(group.name);
    currentId = group.parentId ?? null;
  }

  return names.reverse().join('/');
};
