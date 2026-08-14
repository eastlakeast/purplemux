import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyCliToken } from '@/lib/cli-token';
import { findTab } from '@/lib/cli-utils';
import { removeTabFromPane, renameTabInPane } from '@/lib/layout-store';
import { getProviderByPanelType } from '@/lib/providers';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (!verifyCliToken(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const tabId = req.query.tabId as string;
  const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined;

  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  if (req.method === 'GET') {
    const found = await findTab(workspaceId, tabId);
    if (!found) return res.status(404).json({ error: 'Tab not found' });
    const provider = getProviderByPanelType(found.tab.panelType);
    return res.status(200).json({
      tabId: found.tab.id,
      workspaceId: found.workspaceId,
      paneId: found.paneId,
      name: found.tab.name,
      sessionName: found.tab.sessionName,
      panelType: found.tab.panelType,
      agentProviderId: provider?.id ?? null,
      agentSessionId: provider?.readSessionId(found.tab) ?? null,
    });
  }

  if (req.method === 'DELETE') {
    const found = await findTab(workspaceId, tabId);
    if (!found) return res.status(404).json({ error: 'Tab not found' });
    const ok = await removeTabFromPane(workspaceId, found.paneId, tabId);
    return res.status(200).json({ ok });
  }

  if (req.method === 'PATCH') {
    const { name } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const found = await findTab(workspaceId, tabId);
    if (!found) return res.status(404).json({ error: 'Tab not found' });
    const tab = await renameTabInPane(workspaceId, found.paneId, tabId, name.trim());
    if (!tab) return res.status(404).json({ error: 'Tab not found' });
    const provider = getProviderByPanelType(tab.panelType);
    return res.status(200).json({
      tabId: tab.id,
      workspaceId,
      paneId: found.paneId,
      name: tab.name,
      sessionName: tab.sessionName,
      panelType: tab.panelType,
      agentProviderId: provider?.id ?? null,
      agentSessionId: provider?.readSessionId(tab) ?? null,
    });
  }

  res.setHeader('Allow', 'GET, PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
};

export default handler;
