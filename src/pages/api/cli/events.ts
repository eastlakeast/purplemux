import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyCliToken } from '@/lib/cli-token';
import { getStatusManager } from '@/lib/status-manager';

interface IStatusEvent {
  type?: string;
  tabId?: string;
  workspaceId?: string;
}

const handler = (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!verifyCliToken(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined;
  const tabId = typeof req.query.tabId === 'string' ? req.query.tabId : undefined;
  const manager = getStatusManager();
  const matches = (event: IStatusEvent): boolean => {
    if (event.type !== 'status:update' && event.type !== 'status:hook-event') return false;
    if (tabId && event.tabId !== tabId) return false;
    if (workspaceId && event.workspaceId !== undefined && event.workspaceId !== '' && event.workspaceId !== workspaceId) return false;
    if (workspaceId && event.workspaceId === undefined && event.tabId) {
      return manager.getTabForClient(event.tabId)?.workspaceId === workspaceId;
    }
    return true;
  };
  const writeEvent = (event: object) => {
    if (!matches(event as IStatusEvent)) return;
    res.write(`event: status\ndata: ${JSON.stringify(event)}\n\n`);
  };

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const initialTabs = Object.fromEntries(
    Object.entries(manager.getAllForClient()).filter(([candidateTabId, entry]) =>
      (!tabId || candidateTabId === tabId) && (!workspaceId || entry.workspaceId === workspaceId),
    ),
  );
  res.write(`event: sync\ndata: ${JSON.stringify({ type: 'status:sync', tabs: initialTabs })}\n\n`);

  const unsubscribe = manager.subscribe(writeEvent);
  const heartbeat = setInterval(() => { res.write(': keep-alive\n\n'); }, 15_000);
  heartbeat.unref?.();
  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
};

export const config = {
  api: {
    responseLimit: false,
  },
};

export default handler;
