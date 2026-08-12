import type { NextApiRequest, NextApiResponse } from 'next';
import { splitTabInLayout } from '@/lib/layout-store';
import { getActiveWorkspaceId } from '@/lib/workspace-store';
import type { TTabSplitSide } from '@/lib/tab-drag-data';

const SPLIT_SIDES = new Set<TTabSplitSide>(['left', 'right', 'top', 'bottom']);

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const workspaceId = (req.query.workspace as string) || await getActiveWorkspaceId();
  const paneId = req.query.paneId as string;
  const tabId = req.query.tabId as string;
  const side = req.body?.side as TTabSplitSide | undefined;
  if (!workspaceId || !paneId || !tabId || !side || !SPLIT_SIDES.has(side)) {
    return res.status(400).json({ error: 'workspace, paneId, tabId, and valid side required' });
  }

  const layout = await splitTabInLayout(workspaceId, paneId, tabId, side);
  if (!layout) return res.status(409).json({ error: 'Tab cannot be split' });
  return res.status(200).json(layout);
};

export default handler;
