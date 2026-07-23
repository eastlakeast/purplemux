import type { NextApiRequest, NextApiResponse } from 'next';
import {
  reorderWorkspaces,
  type IReorderGroupItem,
  type IReorderItem,
} from '@/lib/workspace-store';
import type { TWorkspaceSidebarItem } from '@/types/terminal';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body ?? {};

  let items: IReorderItem[] | null = null;
  if (Array.isArray(body.items)) {
    items = body.items.map((it: { id: unknown; groupId?: unknown }) => ({
      id: String(it.id),
      groupId: it.groupId === null ? null : typeof it.groupId === 'string' ? it.groupId : undefined,
    }));
  } else if (Array.isArray(body.workspaceIds) && body.workspaceIds.length > 0) {
    items = body.workspaceIds.map((id: string) => ({ id: String(id) }));
  }

  if (items === null) {
    return res.status(400).json({ error: 'items array required' });
  }

  let sidebarOrder: TWorkspaceSidebarItem[] | undefined;
  if (Array.isArray(body.sidebarOrder)) {
    sidebarOrder = body.sidebarOrder.flatMap((item: { type?: unknown; id?: unknown }) => {
      if ((item.type !== 'group' && item.type !== 'workspace') || typeof item.id !== 'string') return [];
      return [{ type: item.type, id: item.id } as TWorkspaceSidebarItem];
    });
  }

  let groupItems: IReorderGroupItem[] | undefined;
  if (Array.isArray(body.groups)) {
    groupItems = body.groups.flatMap((group: {
      id?: unknown;
      parentId?: unknown;
      childOrder?: unknown;
    }) => {
      if (typeof group.id !== 'string') return [];
      const childOrder = Array.isArray(group.childOrder)
        ? group.childOrder.flatMap((item: { type?: unknown; id?: unknown }) => {
            if ((item.type !== 'group' && item.type !== 'workspace') || typeof item.id !== 'string') return [];
            return [{ type: item.type, id: item.id } as TWorkspaceSidebarItem];
          })
        : undefined;
      return [{
        id: group.id,
        parentId: group.parentId === null ? null : typeof group.parentId === 'string' ? group.parentId : undefined,
        childOrder,
      }];
    });
  }

  const ok = await reorderWorkspaces(items, sidebarOrder, groupItems);
  if (!ok) {
    return res.status(400).json({ error: 'Invalid order' });
  }

  return res.status(200).json({ ok: true });
};

export default handler;
