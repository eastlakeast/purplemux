import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const mocks = vi.hoisted(() => ({
  findTab: vi.fn(),
  getActiveWorkspaceId: vi.fn(),
  updateTabDocument: vi.fn(),
}));

vi.mock('@/lib/cli-utils', () => ({ findTab: mocks.findTab }));
vi.mock('@/lib/workspace-store', () => ({ getActiveWorkspaceId: mocks.getActiveWorkspaceId }));
vi.mock('@/lib/layout-store', () => ({ updateTabDocument: mocks.updateTabDocument }));

const createResponse = () => {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
    setHeader: vi.fn(),
  };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  return response as unknown as NextApiResponse;
};

const createRequest = (
  method: string,
  body: object = {},
  query: Record<string, string> = { workspace: 'ws-one', tabId: 'tab-doc' },
) => ({ method, body, query, headers: {} }) as unknown as NextApiRequest;

const documentTab = {
  pane: { id: 'pane-one' },
  tab: {
    id: 'tab-doc',
    sessionName: 'pt-ws-one-pane-pane-one-tab-doc',
    name: 'Document',
    order: 0,
    panelType: 'document-editor',
    document: { format: 'markdown', content: '# Existing', updatedAt: 10 },
  },
};

describe('document API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findTab.mockResolvedValue(documentTab);
    mocks.getActiveWorkspaceId.mockResolvedValue('ws-active');
    mocks.updateTabDocument.mockImplementation(async (_workspaceId, _tabId, document) => document);
  });

  it('returns the current Markdown document without caching', async () => {
    const response = createResponse();
    const { default: handler } = await import('@/pages/api/document/[tabId]');

    await handler(createRequest('GET'), response);

    expect(mocks.findTab).toHaveBeenCalledWith('ws-one', 'tab-doc');
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ document: documentTab.tab.document });
  });

  it('stores a Markdown update with its monotonic timestamp', async () => {
    const response = createResponse();
    const { default: handler } = await import('@/pages/api/document/[tabId]');

    await handler(createRequest('PATCH', { content: '# Updated', updatedAt: 11 }), response);

    expect(mocks.updateTabDocument).toHaveBeenCalledWith('ws-one', 'tab-doc', {
      format: 'markdown',
      content: '# Updated',
      updatedAt: 11,
    });
    expect(response.status).toHaveBeenCalledWith(200);
  });

  it('rejects invalid timestamps and oversized documents', async () => {
    const { default: handler } = await import('@/pages/api/document/[tabId]');
    const invalidTimestampResponse = createResponse();
    const oversizedResponse = createResponse();

    await handler(createRequest('PATCH', { content: 'text', updatedAt: 0 }), invalidTimestampResponse);
    await handler(createRequest('PATCH', { content: 'x'.repeat(750_001), updatedAt: 12 }), oversizedResponse);

    expect(invalidTimestampResponse.status).toHaveBeenCalledWith(400);
    expect(oversizedResponse.status).toHaveBeenCalledWith(413);
    expect(mocks.updateTabDocument).not.toHaveBeenCalled();
  });

  it('does not expose document content from another panel type', async () => {
    mocks.findTab.mockResolvedValue({
      ...documentTab,
      tab: { ...documentTab.tab, panelType: 'terminal' },
    });
    const response = createResponse();
    const { default: handler } = await import('@/pages/api/document/[tabId]');

    await handler(createRequest('GET'), response);

    expect(response.status).toHaveBeenCalledWith(404);
  });
});
