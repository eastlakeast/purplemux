import type { NextApiRequest, NextApiResponse } from 'next';
import {
  transferTabToNewWorkspace,
  transferTabToWorkspace,
} from '@/lib/workspace-store';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sourceWorkspaceId, sourcePaneId, tabId, targetWorkspaceId, createWorkspace } = req.body ?? {};
  if (
    typeof sourceWorkspaceId !== 'string'
    || typeof sourcePaneId !== 'string'
    || typeof tabId !== 'string'
  ) {
    return res.status(400).json({ error: 'sourceWorkspaceId, sourcePaneId, and tabId required' });
  }
  if (!createWorkspace && typeof targetWorkspaceId !== 'string') {
    return res.status(400).json({ error: 'targetWorkspaceId or createWorkspace required' });
  }

  const result = createWorkspace
    ? await transferTabToNewWorkspace(sourceWorkspaceId, sourcePaneId, tabId)
    : await transferTabToWorkspace(sourceWorkspaceId, sourcePaneId, tabId, targetWorkspaceId);
  if (!result) return res.status(409).json({ error: 'Tab cannot be moved' });
  return res.status(200).json(result);
};

export default handler;
