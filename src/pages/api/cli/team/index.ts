import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyCliToken } from '@/lib/cli-token';
import { resolveWorkspaceTeamContext } from '@/lib/workspace-team';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!verifyCliToken(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined;
  const sessionName = typeof req.query.sessionName === 'string' ? req.query.sessionName : undefined;
  if (!workspaceId && !sessionName) {
    return res.status(400).json({ error: 'Could not determine the current workspace' });
  }

  const team = await resolveWorkspaceTeamContext({ workspaceId, sessionName });
  if (!team) {
    return res.status(404).json({ error: 'No agent team is configured for this workspace group' });
  }
  return res.status(200).json(team);
};

export default handler;
