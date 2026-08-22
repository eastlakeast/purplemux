import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyCliToken } from '@/lib/cli-token';
import { findTab } from '@/lib/cli-utils';
import { hasSession, getPaneCurrentCommand } from '@/lib/tmux';
import { getProviderByPanelType } from '@/lib/providers';
import { detectAgentInputState } from '@/lib/agent-input-state';
import { getStatusManager } from '@/lib/status-manager';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!verifyCliToken(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const tabId = req.query.tabId as string;
  const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined;
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  const found = await findTab(workspaceId, tabId);
  if (!found) return res.status(404).json({ error: 'Tab not found' });

  const provider = getProviderByPanelType(found.tab.panelType);
  const agentSessionId = provider?.readSessionId(found.tab) ?? null;
  const liveStatus = getStatusManager().getTabForClient(tabId);
  const alive = await hasSession(found.tab.sessionName);
  if (!alive) {
    return res.status(200).json({
      tabId,
      workspaceId,
      sessionName: found.tab.sessionName,
      alive: false,
      agentProviderId: provider?.id ?? null,
      agentSessionId,
      claudeSessionId: agentSessionId,
      cliState: liveStatus?.cliState ?? found.tab.cliState ?? null,
      pendingQuestions: liveStatus?.pendingQuestions ?? null,
      inputState: null,
    });
  }

  const [command, inputState] = await Promise.all([
    getPaneCurrentCommand(found.tab.sessionName),
    detectAgentInputState(found.tab.sessionName, found.tab.panelType),
  ]);
  return res.status(200).json({
    tabId,
    workspaceId,
    sessionName: found.tab.sessionName,
    alive: true,
    command,
    cliState: liveStatus?.cliState ?? found.tab.cliState ?? null,
    agentProviderId: provider?.id ?? null,
    agentSessionId,
    // Response key kept as `claudeSessionId` for back-compat with external CLI consumers.
    claudeSessionId: agentSessionId,
    pendingQuestions: liveStatus?.pendingQuestions ?? null,
    inputState,
  });
};

export default handler;
