import type { NextApiRequest, NextApiResponse } from 'next';
import { findTab } from '@/lib/cli-utils';
import { updateTabDocument } from '@/lib/layout-store';
import { getActiveWorkspaceId } from '@/lib/workspace-store';
import type { IDocumentState } from '@/types/terminal';

const MAX_DOCUMENT_LENGTH = 750_000;

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const workspaceId = typeof req.query.workspace === 'string'
    ? req.query.workspace
    : await getActiveWorkspaceId();
  const tabId = req.query.tabId as string;
  if (!workspaceId) return res.status(400).json({ error: 'No workspace found' });

  const found = await findTab(workspaceId, tabId);
  if (!found || found.tab.panelType !== 'document-editor') {
    return res.status(404).json({ error: 'Document not found' });
  }

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      document: found.tab.document ?? { format: 'markdown', content: '', updatedAt: 0 },
    });
  }

  if (req.method === 'PATCH') {
    const { content, updatedAt } = req.body as Partial<IDocumentState>;
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'content must be a string' });
    }
    if (content.length > MAX_DOCUMENT_LENGTH) {
      return res.status(413).json({ error: 'Document is too large' });
    }
    if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt) || updatedAt <= 0) {
      return res.status(400).json({ error: 'updatedAt must be a positive number' });
    }

    const document: IDocumentState = { format: 'markdown', content, updatedAt };
    const saved = await updateTabDocument(workspaceId, tabId, document);
    if (!saved) return res.status(404).json({ error: 'Document not found' });
    return res.status(200).json({ document: saved });
  }

  res.setHeader('Allow', 'GET, PATCH');
  return res.status(405).json({ error: 'Method not allowed' });
};

export default handler;
