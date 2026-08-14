import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyCliToken } from '@/lib/cli-token';
import { getWorkspaces, renameWorkspace } from '@/lib/workspace-store';
import { getWorkspaceGroupPath } from '@/lib/workspace-group-path';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (!verifyCliToken(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const workspaceId = req.query.workspaceId as string;
  const { name } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  const workspace = await renameWorkspace(workspaceId, name.trim());
  if (!workspace) {
    return res.status(404).json({ error: 'Workspace not found' });
  }
  const { groups } = await getWorkspaces();
  return res.status(200).json({
    id: workspace.id,
    name: workspace.name,
    groupPath: getWorkspaceGroupPath(groups, workspace.groupId),
    directories: workspace.directories,
  });
};

export default handler;
