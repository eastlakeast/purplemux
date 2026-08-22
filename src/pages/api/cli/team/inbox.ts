import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyCliToken } from '@/lib/cli-token';
import { listQueuedTeamReplies } from '@/lib/team-reply-queue';
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
  if (!team?.orchestrator?.tabId) {
    return res.status(404).json({ error: 'No agent team orchestrator is configured' });
  }
  if (
    team.currentRole !== 'orchestrator'
    && workspaceId !== team.orchestrator.workspaceId
  ) {
    return res.status(403).json({ error: 'Only the orchestrator can inspect queued replies' });
  }

  const messages = await listQueuedTeamReplies(team.orchestrator.tabId);
  return res.status(200).json({ count: messages.length, messages });
};

export default handler;
