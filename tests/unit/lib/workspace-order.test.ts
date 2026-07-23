import { describe, expect, it } from 'vitest';
import {
  getVisuallyOrderedWorkspaces,
  moveWorkspaceHierarchyItem,
  normalizeWorkspaceHierarchy,
  normalizeWorkspaceSidebarOrder,
  removeWorkspaceGroupFromHierarchy,
} from '@/lib/workspace-order';
import type { IWorkspace, IWorkspaceGroup } from '@/types/terminal';

const groups: IWorkspaceGroup[] = [
  { id: 'g1', name: 'one' },
  { id: 'g2', name: 'two' },
];

const workspaces: IWorkspace[] = [
  { id: 'a', name: 'A', directories: ['/a'] },
  { id: 'b', name: 'B', directories: ['/b'], groupId: 'g1' },
  { id: 'c', name: 'C', directories: ['/c'] },
  { id: 'd', name: 'D', directories: ['/d'], groupId: 'g2' },
  { id: 'e', name: 'E', directories: ['/e'] },
];

describe('workspace sidebar order', () => {
  it('migrates legacy data to groups followed by ungrouped workspaces', () => {
    expect(normalizeWorkspaceSidebarOrder(workspaces, groups)).toEqual([
      { type: 'group', id: 'g1' },
      { type: 'group', id: 'g2' },
      { type: 'workspace', id: 'a' },
      { type: 'workspace', id: 'c' },
      { type: 'workspace', id: 'e' },
    ]);
  });

  it('preserves a mixed group and workspace order', () => {
    const sidebarOrder = [
      { type: 'workspace' as const, id: 'a' },
      { type: 'group' as const, id: 'g1' },
      { type: 'workspace' as const, id: 'c' },
      { type: 'group' as const, id: 'g2' },
      { type: 'workspace' as const, id: 'e' },
    ];

    expect(normalizeWorkspaceSidebarOrder(workspaces, groups, sidebarOrder)).toEqual(sidebarOrder);
    expect(getVisuallyOrderedWorkspaces(workspaces, groups, sidebarOrder).map((workspace) => workspace.id))
      .toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('drops stale and duplicate entries, then appends missing roots', () => {
    expect(normalizeWorkspaceSidebarOrder(workspaces, groups, [
      { type: 'workspace', id: 'a' },
      { type: 'workspace', id: 'a' },
      { type: 'workspace', id: 'b' },
      { type: 'group', id: 'missing' },
    ])).toEqual([
      { type: 'workspace', id: 'a' },
      { type: 'group', id: 'g1' },
      { type: 'group', id: 'g2' },
      { type: 'workspace', id: 'c' },
      { type: 'workspace', id: 'e' },
    ]);
  });

  it('normalizes nested groups and preserves mixed child order', () => {
    const nestedGroups: IWorkspaceGroup[] = [
      { id: 'g1', name: 'parent', childOrder: [
        { type: 'workspace', id: 'a' },
        { type: 'group', id: 'g2' },
      ] },
      { id: 'g2', name: 'child', parentId: 'g1' },
    ];
    const nestedWorkspaces: IWorkspace[] = [
      { id: 'a', name: 'A', directories: ['/a'], groupId: 'g1' },
      { id: 'b', name: 'B', directories: ['/b'], groupId: 'g2' },
      { id: 'c', name: 'C', directories: ['/c'] },
    ];
    const hierarchy = normalizeWorkspaceHierarchy(nestedWorkspaces, nestedGroups, [
      { type: 'group', id: 'g1' },
      { type: 'workspace', id: 'c' },
    ]);

    expect(hierarchy.groups.find((group) => group.id === 'g1')?.childOrder).toEqual([
      { type: 'workspace', id: 'a' },
      { type: 'group', id: 'g2' },
    ]);
    expect(getVisuallyOrderedWorkspaces(
      hierarchy.workspaces,
      hierarchy.groups,
      hierarchy.sidebarOrder,
    ).map((workspace) => workspace.id)).toEqual(['a', 'b', 'c']);
  });

  it('moves groups and workspaces between hierarchy levels and blocks cycles', () => {
    const initial = normalizeWorkspaceHierarchy(workspaces, groups);
    const nested = moveWorkspaceHierarchyItem(
      initial.workspaces,
      initial.groups,
      initial.sidebarOrder,
      { type: 'group', id: 'g2' },
      'g1',
      0,
    );
    expect(nested?.groups.find((group) => group.id === 'g2')?.parentId).toBe('g1');
    expect(moveWorkspaceHierarchyItem(
      nested!.workspaces,
      nested!.groups,
      nested!.sidebarOrder,
      { type: 'group', id: 'g1' },
      'g2',
      0,
    )).toBeNull();

    const movedWorkspace = moveWorkspaceHierarchyItem(
      nested!.workspaces,
      nested!.groups,
      nested!.sidebarOrder,
      { type: 'workspace', id: 'a' },
      'g2',
      0,
    );
    expect(movedWorkspace?.workspaces.find((workspace) => workspace.id === 'a')?.groupId).toBe('g2');
  });

  it('ungroups a nested group in place and promotes its children', () => {
    const hierarchy = normalizeWorkspaceHierarchy(
      [
        { id: 'a', name: 'A', directories: ['/a'], groupId: 'g2' },
        { id: 'b', name: 'B', directories: ['/b'], groupId: 'g3' },
      ],
      [
        { id: 'g1', name: 'parent' },
        { id: 'g2', name: 'remove', parentId: 'g1' },
        { id: 'g3', name: 'child', parentId: 'g2' },
      ],
    );
    const result = removeWorkspaceGroupFromHierarchy(
      hierarchy.workspaces,
      hierarchy.groups,
      hierarchy.sidebarOrder,
      'g2',
    );

    expect(result?.groups.find((group) => group.id === 'g3')?.parentId).toBe('g1');
    expect(result?.workspaces.find((workspace) => workspace.id === 'a')?.groupId).toBe('g1');
    expect(result?.groups.find((group) => group.id === 'g1')?.childOrder).toEqual([
      { type: 'group', id: 'g3' },
      { type: 'workspace', id: 'a' },
    ]);
  });
});
