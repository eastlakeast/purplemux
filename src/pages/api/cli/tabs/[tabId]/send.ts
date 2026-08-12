import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyCliToken } from '@/lib/cli-token';
import { findTab } from '@/lib/cli-utils';
import { sendBracketedPaste, hasSession } from '@/lib/tmux';
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

  const tabId = req.query.tabId as string;
  const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined;
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  const { content } = req.body as { content?: string };
  if (!content) {
    return res.status(400).json({ error: 'content is required' });
  }

  const found = await findTab(workspaceId, tabId);
  if (!found) return res.status(404).json({ error: 'Tab not found' });

  const alive = await hasSession(found.tab.sessionName);
  if (!alive) return res.status(409).json({ error: 'Tab session is not running' });

  try {
    await sendBracketedPaste(
      found.tab.sessionName,
      content,
      () => assertAgentInputAvailable(
        found.tab.sessionName,
        found.tab.panelType,
        found.tab.cliState,
      ),
    );
  } catch (error) {
    if (error instanceof AgentInputBlockedError) {
      return res.status(409).json({ error: error.message, inputState: error.inputState });
    }
    throw error;
  }
  return res.status(200).json({ status: 'sent' });
};

export default handler;
