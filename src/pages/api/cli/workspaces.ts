import os from 'os';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createWorkspaceWithDetails, deleteWorkspace, getWorkspaces } from '@/lib/workspace-store';
import { verifyCliToken } from '@/lib/cli-token';
import { getBrowserBridge } from '@/lib/browser-bridge-client';
import { hasLiveElectronSyncClient } from '@/lib/sync-server';
import { getWorkspaceGroupPath } from '@/lib/workspace-group-path';
import { collectAllTabs, readLayoutFile, resolveLayoutFile } from '@/lib/layout-store';
import { getProviderByPanelType } from '@/lib/providers';
import { getStatusManager } from '@/lib/status-manager';
import { checkAgentAvailabilityForPanelType, toAgentAvailabilityError } from '@/lib/agent-availability';
import { buildNaiveClaudeCommand } from '@/lib/naive-agent-command';
import { sendKeys } from '@/lib/tmux';
import { createLogger } from '@/lib/logger';
import type { TPanelType } from '@/types/terminal';

const log = createLogger('api:cli:workspaces');

const INITIAL_WORKER_PANEL_TYPES = ['claude-code', 'codex-cli'] as const;
type TInitialWorkerPanelType = typeof INITIAL_WORKER_PANEL_TYPES[number];

interface IInitialTabRequest {
  panelType?: string;
  name?: string;
  preset?: string;
  mcpConfigs?: string[];
}

interface IInitialWorkerConfig {
  panelType: TInitialWorkerPanelType;
  name?: string;
  preset?: 'naive';
  mcpConfigs?: string[];
}

const isInitialWorkerPanelType = (value: string): value is TInitialWorkerPanelType =>
  INITIAL_WORKER_PANEL_TYPES.includes(value as TInitialWorkerPanelType);

const toCliWorkspace = (
  workspace: Awaited<ReturnType<typeof getWorkspaces>>['workspaces'][number],
  groups: Awaited<ReturnType<typeof getWorkspaces>>['groups'],
) => ({
  id: workspace.id,
  name: workspace.name,
  groupPath: getWorkspaceGroupPath(groups, workspace.groupId),
  directories: workspace.directories,
});

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (!verifyCliToken(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (req.method === 'GET') {
    const { workspaces, groups } = await getWorkspaces();
    return res.status(200).json({
      workspaces: workspaces.map((workspace) => toCliWorkspace(workspace, groups)),
    });
  }

  if (req.method === 'POST') {
    const { name, groupPath, directories, initialTab: rawInitialTab } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (groupPath !== undefined && (typeof groupPath !== 'string' || !groupPath.trim())) {
      return res.status(400).json({ error: 'groupPath must be a non-empty string' });
    }
    if (
      directories !== undefined
      && (!Array.isArray(directories)
        || directories.length === 0
        || directories.some((directory) => typeof directory !== 'string' || !directory.trim()))
    ) {
      return res.status(400).json({ error: 'directories must be a non-empty array of directory paths' });
    }
    if (
      rawInitialTab !== undefined
      && (rawInitialTab === null || typeof rawInitialTab !== 'object' || Array.isArray(rawInitialTab))
    ) {
      return res.status(400).json({ error: 'initialTab must be an object' });
    }

    const initialTab = rawInitialTab as IInitialTabRequest | undefined;
    let initialWorker: IInitialWorkerConfig | null = null;
    if (initialTab) {
      const resolvedPanelType = initialTab.panelType ?? (initialTab.preset === 'naive' ? 'claude-code' : null);
      if (typeof resolvedPanelType !== 'string' || !isInitialWorkerPanelType(resolvedPanelType)) {
        return res.status(400).json({
          error: 'initialTab.panelType must be claude-code or codex-cli',
        });
      }
      if (initialTab.name !== undefined && (typeof initialTab.name !== 'string' || !initialTab.name.trim())) {
        return res.status(400).json({ error: 'initialTab.name must be a non-empty string' });
      }
      if (initialTab.preset !== undefined && initialTab.preset !== 'naive') {
        return res.status(400).json({ error: 'initialTab.preset must be naive' });
      }
      if (initialTab.preset === 'naive' && resolvedPanelType !== 'claude-code') {
        return res.status(400).json({ error: 'The naive preset supports claude-code only' });
      }
      if (
        initialTab.mcpConfigs !== undefined
        && (!Array.isArray(initialTab.mcpConfigs)
          || initialTab.mcpConfigs.some((item) => typeof item !== 'string' || !item.trim()))
      ) {
        return res.status(400).json({ error: 'initialTab.mcpConfigs must be an array of file paths' });
      }
      if (initialTab.mcpConfigs !== undefined && initialTab.preset !== 'naive') {
        return res.status(400).json({ error: 'initialTab.mcpConfigs requires the naive preset' });
      }
      initialWorker = {
        panelType: resolvedPanelType,
        ...(initialTab.name ? { name: initialTab.name.trim() } : {}),
        ...(initialTab.preset === 'naive' ? { preset: 'naive' as const } : {}),
        ...(initialTab.mcpConfigs ? { mcpConfigs: initialTab.mcpConfigs.map((item) => item.trim()) } : {}),
      };
    }

    if (initialWorker) {
      const availability = await checkAgentAvailabilityForPanelType(initialWorker.panelType);
      if (!availability.ok) {
        return res.status(availability.status).json(toAgentAvailabilityError(availability));
      }
    }
    if (!getBrowserBridge() || !hasLiveElectronSyncClient()) {
      return res.status(503).json({
        error: 'Live Electron app unavailable. Launch purplemux and wait for the sidebar to finish loading.',
      });
    }

    let createdWorkspaceId: string | null = null;
    try {
      const workspace = await createWorkspaceWithDetails({
        name: name.trim(),
        groupPath: typeof groupPath === 'string' ? groupPath : undefined,
        directories: Array.isArray(directories) ? directories : [os.homedir()],
        ...(initialWorker ? {
          layoutOptions: {
            panelType: initialWorker.panelType as TPanelType,
            ...(initialWorker.name ? { tabName: initialWorker.name } : {}),
          },
        } : {}),
      });
      createdWorkspaceId = workspace.id;
      const layout = await readLayoutFile(resolveLayoutFile(workspace.id));
      const defaultTab = layout ? collectAllTabs(layout.root)[0] : null;
      if (!defaultTab) {
        throw new Error('Created workspace has no initial tab');
      }
      if (defaultTab.panelType !== 'web-browser') {
        const provider = getProviderByPanelType(defaultTab.panelType);
        getStatusManager().registerTab(defaultTab.id, {
          cliState: 'inactive',
          workspaceId: workspace.id,
          tabName: defaultTab.name,
          tmuxSession: defaultTab.sessionName,
          panelType: defaultTab.panelType,
          agentProviderId: provider?.id,
          agentSessionId: provider?.readSessionId(defaultTab) ?? null,
          lastEvent: null,
          eventSeq: 0,
        });
      }
      if (initialWorker) {
        const provider = getProviderByPanelType(initialWorker.panelType);
        if (!provider) {
          throw new Error(`Agent provider unavailable for ${initialWorker.panelType}`);
        }
        const launchCommand = initialWorker.preset === 'naive'
          ? await buildNaiveClaudeCommand(initialWorker.mcpConfigs)
          : await provider.buildLaunchCommand({ workspaceId: workspace.id });
        await sendKeys(defaultTab.sessionName, launchCommand);
        getStatusManager().markAgentLaunch(defaultTab.id);
      }
      const { groups } = await getWorkspaces();
      const tabProvider = getProviderByPanelType(defaultTab.panelType);
      return res.status(201).json({
        ...toCliWorkspace(workspace, groups),
        initialTab: {
          tabId: defaultTab.id,
          name: defaultTab.name,
          panelType: defaultTab.panelType ?? 'terminal',
          sessionName: defaultTab.sessionName,
          agentProviderId: tabProvider?.id ?? null,
          agentSessionId: tabProvider?.readSessionId(defaultTab) ?? null,
        },
      });
    } catch (err) {
      if (createdWorkspaceId) {
        await deleteWorkspace(createdWorkspaceId).catch((rollbackError) => {
          log.error(`workspace create rollback failed: ${rollbackError instanceof Error ? rollbackError.message : rollbackError}`);
        });
      }
      const message = err instanceof Error ? err.message : 'Failed to create workspace';
      const isValidation = message.startsWith('Directory')
        || message.startsWith('Please enter')
        || message.startsWith('groupPath');
      return res.status(isValidation ? 400 : 500).json({ error: message });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
};

export default handler;
