import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const mocks = vi.hoisted(() => ({
  createWorkspaceWithDetails: vi.fn(),
  deleteWorkspace: vi.fn(),
  getWorkspaces: vi.fn(),
  collectAllTabs: vi.fn(),
  readLayoutFile: vi.fn(),
  getProviderByPanelType: vi.fn(),
  checkAgentAvailabilityForPanelType: vi.fn(),
  buildNaiveClaudeCommand: vi.fn(),
  sendKeys: vi.fn(),
  registerTab: vi.fn(),
  markAgentLaunch: vi.fn(),
  buildLaunchCommand: vi.fn(),
}));

vi.mock('@/lib/workspace-store', () => ({
  createWorkspaceWithDetails: mocks.createWorkspaceWithDetails,
  deleteWorkspace: mocks.deleteWorkspace,
  getWorkspaces: mocks.getWorkspaces,
}));
vi.mock('@/lib/cli-token', () => ({ verifyCliToken: () => true }));
vi.mock('@/lib/browser-bridge-client', () => ({ getBrowserBridge: () => ({}) }));
vi.mock('@/lib/sync-server', () => ({ hasLiveElectronSyncClient: () => true }));
vi.mock('@/lib/workspace-group-path', () => ({ getWorkspaceGroupPath: () => 'fnc-ax/AIOS' }));
vi.mock('@/lib/layout-store', () => ({
  collectAllTabs: mocks.collectAllTabs,
  readLayoutFile: mocks.readLayoutFile,
  resolveLayoutFile: (workspaceId: string) => `/tmp/${workspaceId}/layout.json`,
}));
vi.mock('@/lib/providers', () => ({ getProviderByPanelType: mocks.getProviderByPanelType }));
vi.mock('@/lib/status-manager', () => ({
  getStatusManager: () => ({
    registerTab: mocks.registerTab,
    markAgentLaunch: mocks.markAgentLaunch,
  }),
}));
vi.mock('@/lib/agent-availability', () => ({
  checkAgentAvailabilityForPanelType: mocks.checkAgentAvailabilityForPanelType,
  toAgentAvailabilityError: () => ({ error: 'unavailable' }),
}));
vi.mock('@/lib/naive-agent-command', () => ({
  buildNaiveClaudeCommand: mocks.buildNaiveClaudeCommand,
}));
vi.mock('@/lib/tmux', () => ({ sendKeys: mocks.sendKeys }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: vi.fn() }),
}));

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

const createRequest = (body: object) => ({
  method: 'POST',
  body,
  query: {},
  headers: {},
}) as unknown as NextApiRequest;

describe('CLI workspace creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createWorkspaceWithDetails.mockResolvedValue({
      id: 'ws-new',
      name: 'Worker workspace',
      directories: ['/tmp/project'],
      groupId: 'grp-aios',
    });
    mocks.getWorkspaces.mockResolvedValue({ workspaces: [], groups: [] });
    mocks.readLayoutFile.mockResolvedValue({ root: {} });
    mocks.collectAllTabs.mockReturnValue([{
      id: 'tab-initial',
      sessionName: 'pt-ws-new-pane-one-tab-initial',
      name: 'Worker',
      order: 0,
      panelType: 'claude-code',
    }]);
    mocks.checkAgentAvailabilityForPanelType.mockResolvedValue({ ok: true });
    mocks.buildLaunchCommand.mockResolvedValue('claude --canonical-launch');
    mocks.buildNaiveClaudeCommand.mockResolvedValue('claude --naive-launch');
    mocks.deleteWorkspace.mockResolvedValue(true);
    mocks.getProviderByPanelType.mockImplementation((panelType: string | undefined) => {
      if (panelType !== 'claude-code' && panelType !== 'codex-cli') return null;
      return {
        id: panelType === 'claude-code' ? 'claude' : 'codex',
        buildLaunchCommand: mocks.buildLaunchCommand,
        readSessionId: () => null,
      };
    });
  });

  it('launches the requested worker in the workspace initial tab', async () => {
    const response = createResponse();
    const { default: handler } = await import('@/pages/api/cli/workspaces');

    await handler(createRequest({
      name: 'Worker workspace',
      groupPath: 'fnc-ax/AIOS',
      directories: ['/tmp/project'],
      initialTab: {
        panelType: 'claude-code',
        name: 'Worker',
      },
    }), response);

    expect(mocks.createWorkspaceWithDetails).toHaveBeenCalledWith({
      name: 'Worker workspace',
      groupPath: 'fnc-ax/AIOS',
      directories: ['/tmp/project'],
      layoutOptions: { panelType: 'claude-code', tabName: 'Worker' },
    });
    expect(mocks.buildLaunchCommand).toHaveBeenCalledWith({ workspaceId: 'ws-new' });
    expect(mocks.sendKeys).toHaveBeenCalledWith(
      'pt-ws-new-pane-one-tab-initial',
      'claude --canonical-launch',
    );
    expect(mocks.markAgentLaunch).toHaveBeenCalledWith('tab-initial');
    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      id: 'ws-new',
      initialTab: expect.objectContaining({
        tabId: 'tab-initial',
        panelType: 'claude-code',
        name: 'Worker',
      }),
    }));
  });

  it('keeps the single default terminal when no initial worker is requested', async () => {
    mocks.collectAllTabs.mockReturnValue([{
      id: 'tab-initial',
      sessionName: 'pt-ws-new-pane-one-tab-initial',
      name: '',
      order: 0,
    }]);
    const response = createResponse();
    const { default: handler } = await import('@/pages/api/cli/workspaces');

    await handler(createRequest({ name: 'Terminal workspace', directories: ['/tmp/project'] }), response);

    expect(mocks.createWorkspaceWithDetails).toHaveBeenCalledWith({
      name: 'Terminal workspace',
      groupPath: undefined,
      directories: ['/tmp/project'],
    });
    expect(mocks.sendKeys).not.toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      initialTab: expect.objectContaining({ panelType: 'terminal' }),
    }));
  });

  it('builds the naive Claude command for a naive initial worker', async () => {
    const response = createResponse();
    const { default: handler } = await import('@/pages/api/cli/workspaces');

    await handler(createRequest({
      name: 'Naive worker',
      directories: ['/tmp/project'],
      initialTab: {
        preset: 'naive',
        name: 'Naive',
        mcpConfigs: ['/tmp/mcp.json'],
      },
    }), response);

    expect(mocks.checkAgentAvailabilityForPanelType).toHaveBeenCalledWith('claude-code');
    expect(mocks.buildNaiveClaudeCommand).toHaveBeenCalledWith(['/tmp/mcp.json']);
    expect(mocks.buildLaunchCommand).not.toHaveBeenCalled();
    expect(mocks.sendKeys).toHaveBeenCalledWith(
      'pt-ws-new-pane-one-tab-initial',
      'claude --naive-launch',
    );
  });

  it('rejects non-worker panel types before creating a workspace', async () => {
    const response = createResponse();
    const { default: handler } = await import('@/pages/api/cli/workspaces');

    await handler(createRequest({
      name: 'Invalid worker',
      initialTab: { panelType: 'terminal' },
    }), response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(mocks.createWorkspaceWithDetails).not.toHaveBeenCalled();
  });

  it('rolls back the workspace when the initial worker cannot launch', async () => {
    mocks.sendKeys.mockRejectedValueOnce(new Error('tmux launch failed'));
    const response = createResponse();
    const { default: handler } = await import('@/pages/api/cli/workspaces');

    await handler(createRequest({
      name: 'Broken worker',
      directories: ['/tmp/project'],
      initialTab: { panelType: 'claude-code' },
    }), response);

    expect(mocks.deleteWorkspace).toHaveBeenCalledWith('ws-new');
    expect(response.status).toHaveBeenCalledWith(500);
  });
});
