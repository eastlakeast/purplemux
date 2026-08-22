import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyCliToken } from '@/lib/cli-token';
import { resolveWorkspaceTeamContext } from '@/lib/workspace-team';
import { enqueueTeamReply, flushTeamReplyQueue } from '@/lib/team-reply-queue';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!verifyCliToken(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { workspaceId, sessionName, content } = req.body as {
    workspaceId?: string;
    sessionName?: string;
    content?: string;
  };
  if ((!workspaceId && !sessionName) || !content?.trim()) {
    return res.status(400).json({ error: 'content and session context are required' });
  }

  const team = await resolveWorkspaceTeamContext({ workspaceId, sessionName });
  if (!team) {
    return res.status(404).json({ error: 'No agent team is configured for this workspace group' });
  }
  if (team.currentRole !== 'worker' || !team.currentMember) {
    return res.status(403).json({ error: 'Only a configured worker tab can reply to the orchestrator' });
  }
  const orchestrator = team.orchestrator;
  if (!orchestrator?.sessionName || !orchestrator.tabId || !orchestrator.panelType) {
    return res.status(409).json({ error: 'The configured orchestrator tab is unavailable' });
  }

  const message = `[PURPLEMUX TEAM REPORT]
Group: ${team.groupName}
From: ${team.currentMember.alias} (${team.currentMember.workspaceName})

${content.trim()}`;
  const queued = await enqueueTeamReply({
    groupName: team.groupName,
    fromAlias: team.currentMember.alias,
    fromWorkspaceName: team.currentMember.workspaceName,
    orchestratorAlias: orchestrator.alias,
    orchestratorWorkspaceId: orchestrator.workspaceId,
    orchestratorTabId: orchestrator.tabId,
    orchestratorSessionName: orchestrator.sessionName,
    orchestratorPanelType: orchestrator.panelType,
    message,
  });
  void flushTeamReplyQueue();
  return res.status(202).json({
    status: 'queued',
    messageId: queued.id,
    orchestrator: orchestrator.alias,
  });
};

export default handler;
