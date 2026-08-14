import { describe, expect, it } from 'vitest';
import {
  ensureWorkspaceGroupPath,
  getWorkspaceGroupPath,
  parseWorkspaceGroupPath,
} from '@/lib/workspace-group-path';
import type { IWorkspaceGroup, TWorkspaceSidebarItem } from '@/types/terminal';

describe('workspace group paths', () => {
  it('parses a nested group path and rejects empty segments', () => {
    expect(parseWorkspaceGroupPath(' fnc-ax / 데이터허브 ')).toEqual(['fnc-ax', '데이터허브']);
    expect(() => parseWorkspaceGroupPath('fnc-ax//데이터허브')).toThrow(/non-empty/);
  });

  it('reuses existing groups and creates only missing descendants', () => {
    const groups: IWorkspaceGroup[] = [{
      id: 'grp-root',
      name: 'fnc-ax',
      parentId: null,
      childOrder: [],
    }];
    const sidebarOrder: TWorkspaceSidebarItem[] = [{ type: 'group', id: 'grp-root' }];
    let sequence = 0;

    const result = ensureWorkspaceGroupPath(
      groups,
      sidebarOrder,
      ['fnc-ax', '데이터허브'],
      () => `grp-new-${++sequence}`,
    );

    expect(result.groupId).toBe('grp-new-1');
    expect(result.groups).toHaveLength(2);
    expect(result.groups[1]).toMatchObject({
      id: 'grp-new-1',
      name: '데이터허브',
      parentId: 'grp-root',
    });
    expect(result.groups[0].childOrder).toEqual([{ type: 'group', id: 'grp-new-1' }]);
    expect(result.sidebarOrder).toEqual(sidebarOrder);
    expect(getWorkspaceGroupPath(result.groups, result.groupId)).toBe('fnc-ax/데이터허브');
  });

  it('returns null for ungrouped or broken group references', () => {
    expect(getWorkspaceGroupPath([], null)).toBeNull();
    expect(getWorkspaceGroupPath([], 'missing')).toBeNull();
  });
});
