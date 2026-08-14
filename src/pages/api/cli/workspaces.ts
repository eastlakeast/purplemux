import os from 'os';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createWorkspaceWithDetails, getWorkspaces } from '@/lib/workspace-store';
import { verifyCliToken } from '@/lib/cli-token';
import { getBrowserBridge } from '@/lib/browser-bridge-client';
import { hasLiveElectronSyncClient } from '@/lib/sync-server';
import { getWorkspaceGroupPath } from '@/lib/workspace-group-path';

const toCliWorkspace = (
  workspace: Awaited<ReturnType<typeof getWorkspaces>>['workspaces'][number],
  groups: Awaited<ReturnType<typeof getWorkspaces>>['groups'],
) => ({
  id: workspace.id,
  name: workspace.name,
  groupPath: getWorkspaceGroupPath(groups, workspace.groupId),
  directories: workspace.directories,
});

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (!verifyCliToken(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (req.method === 'GET') {
    const { workspaces, groups } = await getWorkspaces();
    return res.status(200).json({
      workspaces: workspaces.map((workspace) => toCliWorkspace(workspace, groups)),
    });
  }

  if (req.method === 'POST') {
    const { name, groupPath, directories } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (groupPath !== undefined && (typeof groupPath !== 'string' || !groupPath.trim())) {
      return res.status(400).json({ error: 'groupPath must be a non-empty string' });
    }
    if (
      directories !== undefined
      && (!Array.isArray(directories)
        || directories.length === 0
        || directories.some((directory) => typeof directory !== 'string' || !directory.trim()))
    ) {
      return res.status(400).json({ error: 'directories must be a non-empty array of directory paths' });
    }
    if (!getBrowserBridge() || !hasLiveElectronSyncClient()) {
      return res.status(503).json({
        error: 'Live Electron app unavailable. Launch purplemux and wait for the sidebar to finish loading.',
      });
    }

    try {
      const workspace = await createWorkspaceWithDetails({
        name: name.trim(),
        groupPath: typeof groupPath === 'string' ? groupPath : undefined,
        directories: Array.isArray(directories) ? directories : [os.homedir()],
      });
      const { groups } = await getWorkspaces();
      return res.status(201).json(toCliWorkspace(workspace, groups));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create workspace';
      const isValidation = message.startsWith('Directory')
        || message.startsWith('Please enter')
        || message.startsWith('groupPath');
      return res.status(isValidation ? 400 : 500).json({ error: message });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
};

export default handler;
