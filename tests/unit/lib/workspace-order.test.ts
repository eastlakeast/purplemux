import { describe, expect, it } from 'vitest';
import { getVisuallyOrderedWorkspaces, normalizeWorkspaceSidebarOrder } from '@/lib/workspace-order';
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
});
