import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyCliToken } from '@/lib/cli-token';
import { hasSession, sendBracketedPaste } from '@/lib/tmux';
import { resolveWorkspaceTeamContext } from '@/lib/workspace-team';
import {
  AgentInputBlockedError,
  assertAgentInputAvailable,
} from '@/lib/agent-input-state';

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
  if (!orchestrator?.sessionName) {
    return res.status(409).json({ error: 'The configured orchestrator tab is unavailable' });
  }
  const orchestratorSessionName = orchestrator.sessionName;
  if (!(await hasSession(orchestratorSessionName))) {
    return res.status(409).json({ error: 'The orchestrator session is not running' });
  }

  const message = `[PURPLEMUX TEAM REPORT]
Group: ${team.groupName}
From: ${team.currentMember.alias} (${team.currentMember.workspaceName})

${content.trim()}`;
  try {
    await sendBracketedPaste(
      orchestratorSessionName,
      message,
      () => assertAgentInputAvailable(
        orchestratorSessionName,
        orchestrator.panelType ?? undefined,
        orchestrator.cliState,
      ),
    );
  } catch (error) {
    if (error instanceof AgentInputBlockedError) {
      return res.status(409).json({ error: error.message, inputState: error.inputState });
    }
    throw error;
  }
  return res.status(200).json({
    status: 'sent',
    orchestrator: orchestrator.alias,
  });
};

export default handler;
