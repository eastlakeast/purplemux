import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyCliToken } from '@/lib/cli-token';
import { hasSession, sendBracketedPaste } from '@/lib/tmux';
import {
  matchWorkspaceTeamMembers,
  resolveWorkspaceTeamContext,
  type IResolvedWorkspaceTeamMember,
} from '@/lib/workspace-team';

interface ISendResult {
  alias: string;
  workspaceId: string;
  tabId: string | null;
  status: 'sent' | 'unavailable' | 'not-running' | 'failed';
}

const buildTaskMessage = (
  groupName: string,
  from: IResolvedWorkspaceTeamMember,
  to: IResolvedWorkspaceTeamMember,
  content: string,
): string => `[PURPLEMUX TEAM TASK]
Group: ${groupName}
From: ${from.alias} (${from.workspaceName})
To: ${to.alias} (${to.workspaceName})

${content}

Report completion, blockers, or questions to the orchestrator with:
purplemux team reply "YOUR MESSAGE"`;

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!verifyCliToken(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { workspaceId, sessionName, target, content } = req.body as {
    workspaceId?: string;
    sessionName?: string;
    target?: string;
    content?: string;
  };
  if ((!workspaceId && !sessionName) || !target?.trim() || !content?.trim()) {
    return res.status(400).json({ error: 'target, content, and session context are required' });
  }

  const team = await resolveWorkspaceTeamContext({ workspaceId, sessionName });
  if (!team) {
    return res.status(404).json({ error: 'No agent team is configured for this workspace group' });
  }
  if (team.currentRole !== 'orchestrator' || !team.currentMember) {
    return res.status(403).json({ error: 'Only the configured orchestrator tab can dispatch team tasks' });
  }

  const targets = target.trim().toLocaleLowerCase() === 'all'
    ? team.workers
    : matchWorkspaceTeamMembers(team, target, true);
  if (targets.length === 0) {
    return res.status(404).json({ error: `Worker not found: ${target}` });
  }

  const results: ISendResult[] = [];
  for (const worker of targets) {
    if (!worker.sessionName) {
      results.push({
        alias: worker.alias,
        workspaceId: worker.workspaceId,
        tabId: worker.tabId,
        status: 'unavailable',
      });
      continue;
    }
    if (!(await hasSession(worker.sessionName))) {
      results.push({
        alias: worker.alias,
        workspaceId: worker.workspaceId,
        tabId: worker.tabId,
        status: 'not-running',
      });
      continue;
    }
    try {
      await sendBracketedPaste(
        worker.sessionName,
        buildTaskMessage(team.groupName, team.currentMember, worker, content.trim()),
      );
      results.push({
        alias: worker.alias,
        workspaceId: worker.workspaceId,
        tabId: worker.tabId,
        status: 'sent',
      });
    } catch {
      results.push({
        alias: worker.alias,
        workspaceId: worker.workspaceId,
        tabId: worker.tabId,
        status: 'failed',
      });
    }
  }

  const sent = results.filter((result) => result.status === 'sent').length;
  if (sent === 0) {
    return res.status(409).json({ error: 'No worker sessions received the task', results });
  }
  return res.status(200).json({ sent, results });
};

export default handler;
