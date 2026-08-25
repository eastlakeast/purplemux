import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { nanoid } from 'nanoid';
import { listSessions, killSession, resolveExistingDir } from '@/lib/tmux';
import { createLogger } from '@/lib/logger';
import { broadcastSync } from '@/lib/sync-server';
import {
  readLayoutFile,
  writeLayoutFile,
  resolveLayoutDir,
  resolveLayoutFile,
  removeLayoutFile,
  crossCheckLayout,
  collectAllTabs,
  createDefaultLayout,
  moveTabBetweenWorkspaces,
} from '@/lib/layout-store';
import type { ITabWorkspaceLayoutTransferResult } from '@/lib/layout-store';
import type { ICreateLayoutOptions } from '@/lib/layout-store';
import { listProviders } from '@/lib/providers/registry';
import {
  getVisuallyOrderedWorkspaces,
  moveWorkspaceHierarchyItem,
  normalizeWorkspaceHierarchy,
  removeWorkspaceGroupFromHierarchy,
} from '@/lib/workspace-order';
import {
  ensureWorkspaceGroupPath,
  parseWorkspaceGroupPath,
} from '@/lib/workspace-group-path';
import { isWorkspaceGroupColor } from '@/lib/workspace-group-colors';
import { panelUsesTmux } from '@/lib/panel-type';
import type {
  IWorkspace,
  IWorkspaceGroup,
  IWorkspaceTeamConfig,
  IWorkspacesData,
  ILayoutData,
  TWorkspaceGroupColor,
  TWorkspaceSidebarItem,
} from '@/types/terminal';

const log = createLogger('workspace');

const WORKSPACE_PREFIX = 'Workspace ';

export const writeWorkspacePrompts = async (ws: IWorkspace): Promise<void> => {
  const tasks: Promise<void>[] = [];
  for (const provider of listProviders()) {
    const task = provider.writeWorkspacePrompt?.(ws);
    if (task) tasks.push(task);
  }
  await Promise.all(tasks);
};

export const writeAllWorkspacePrompts = async (workspaces: IWorkspace[]): Promise<void> => {
  await Promise.all(workspaces.map(writeWorkspacePrompts));
};

const nextWorkspaceName = (workspaces: IWorkspace[]): string => {
  let max = 0;
  for (const ws of workspaces) {
    if (ws.name.startsWith(WORKSPACE_PREFIX)) {
      const n = parseInt(ws.name.slice(WORKSPACE_PREFIX.length), 10);
      if (n > max) max = n;
    }
  }
  return `${WORKSPACE_PREFIX}${max + 1}`;
};

const BASE_DIR = path.join(os.homedir(), '.purplemux');
const WORKSPACES_FILE = path.join(BASE_DIR, 'workspaces.json');
const LEGACY_LAYOUT_FILE = path.join(BASE_DIR, 'layout.json');
const LEGACY_TABS_FILE = path.join(BASE_DIR, 'tabs.json');

const g = globalThis as unknown as {
  __purplemuxWorkspaceLock?: Promise<void>;
  __purplemuxWorkspacesContentCache?: string;
};
if (!g.__purplemuxWorkspaceLock) g.__purplemuxWorkspaceLock = Promise.resolve();

const withLock = async <T>(fn: () => Promise<T>): Promise<T> => {
  let release: () => void;
  const next = new Promise<void>((r) => {
    release = r;
  });
  const prev = g.__purplemuxWorkspaceLock!;
  g.__purplemuxWorkspaceLock = next;
  await prev;
  try {
    return await fn();
  } finally {
    release!();
  }
};

const emptyState = (): IWorkspacesData => ({
  workspaces: [],
  groups: [],
  sidebarOrder: [],
  sidebarCollapsed: false,
  sidebarWidth: 240,
  updatedAt: new Date().toISOString(),
});

const ensureGroups = (data: IWorkspacesData): IWorkspaceGroup[] => {
  if (!data.groups) data.groups = [];
  return data.groups;
};

const normalizeWorkspaceOrder = (data: IWorkspacesData): void => {
  const hierarchy = normalizeWorkspaceHierarchy(data.workspaces, ensureGroups(data), data.sidebarOrder);
  data.groups = hierarchy.groups;
  data.sidebarOrder = hierarchy.sidebarOrder;
  data.workspaces = getVisuallyOrderedWorkspaces(
    hierarchy.workspaces,
    hierarchy.groups,
    hierarchy.sidebarOrder,
  );
  cleanupWorkspaceTeamReferences(data);
};

const workspaceBelongsToGroupTree = (
  workspace: IWorkspace,
  groups: IWorkspaceGroup[],
  groupId: string,
): boolean => {
  const byId = new Map(groups.map((group) => [group.id, group]));
  let currentId = workspace.groupId ?? null;
  while (currentId) {
    if (currentId === groupId) return true;
    currentId = byId.get(currentId)?.parentId ?? null;
  }
  return false;
};

const cleanupWorkspaceTeamReferences = (data: IWorkspacesData): void => {
  const groups = data.groups ?? [];
  for (const group of groups) {
    if (!group.team?.orchestrator) continue;
    const orchestrator = data.workspaces.find(
      (workspace) => workspace.id === group.team?.orchestrator.workspaceId,
    );
    if (!orchestrator || !workspaceBelongsToGroupTree(orchestrator, groups, group.id)) {
      delete group.team;
      continue;
    }
    if (!group.team.workerTabOverrides) continue;
    for (const workspaceId of Object.keys(group.team.workerTabOverrides)) {
      const workspace = data.workspaces.find((candidate) => candidate.id === workspaceId);
      if (!workspace || !workspaceBelongsToGroupTree(workspace, groups, group.id)) {
        delete group.team.workerTabOverrides[workspaceId];
      }
    }
    if (Object.keys(group.team.workerTabOverrides).length === 0) {
      delete group.team.workerTabOverrides;
    }
  }
};

const relocateWorkspaceTeamTab = (
  data: IWorkspacesData,
  tabId: string,
  sourceWorkspaceId: string,
  targetWorkspaceId: string,
): void => {
  const targetWorkspace = data.workspaces.find((workspace) => workspace.id === targetWorkspaceId);
  if (!targetWorkspace) return;
  const groups = data.groups ?? [];

  for (const group of groups) {
    const team = group.team;
    if (!team) continue;
    const targetIsMember = workspaceBelongsToGroupTree(targetWorkspace, groups, group.id);
    if (
      team.orchestrator.workspaceId === sourceWorkspaceId
      && team.orchestrator.tabId === tabId
    ) {
      if (!targetIsMember) {
        delete group.team;
        continue;
      }
      team.orchestrator.workspaceId = targetWorkspaceId;
    }

    if (team.workerTabOverrides?.[sourceWorkspaceId] === tabId) {
      delete team.workerTabOverrides[sourceWorkspaceId];
      if (targetIsMember) team.workerTabOverrides[targetWorkspaceId] = tabId;
    }
  }
};

const readWorkspacesFile = async (): Promise<IWorkspacesData | null> => {
  let raw: string;
  try {
    raw = await fs.readFile(WORKSPACES_FILE, 'utf-8');
  } catch {
    return null;
  }

  try {
    const data = JSON.parse(raw) as IWorkspacesData;
    for (const ws of data.workspaces) {
      const legacy = ws as unknown as { directory?: string; order?: number };
      if (!ws.directories && legacy.directory) {
        ws.directories = [legacy.directory];
        delete legacy.directory;
      }
      delete legacy.order;
    }
    if (!Array.isArray(data.groups)) data.groups = [];
    if (!Array.isArray(data.sidebarOrder)) data.sidebarOrder = undefined;
    for (const g of data.groups) {
      delete (g as unknown as { order?: number }).order;
      if (g.parentId !== null && typeof g.parentId !== 'string') g.parentId = null;
      if (!Array.isArray(g.childOrder)) g.childOrder = undefined;
      if (g.color !== undefined && !isWorkspaceGroupColor(g.color)) delete g.color;
    }
    const validGroupIds = new Set(data.groups.map((g) => g.id));
    for (const ws of data.workspaces) {
      if (ws.groupId && !validGroupIds.has(ws.groupId)) {
        ws.groupId = null;
      }
    }
    normalizeWorkspaceOrder(data);
    return data;
  } catch {
    log.warn('Failed to parse workspaces.json, starting empty');
    try {
      await fs.copyFile(WORKSPACES_FILE, WORKSPACES_FILE.replace(/\.json$/, '.json.bak'));
    } catch {}
    return null;
  }
};

const writeWorkspacesFile = async (data: IWorkspacesData): Promise<void> => {
  normalizeWorkspaceOrder(data);
  const { workspaces, groups, sidebarOrder, activeWorkspaceId, sidebarCollapsed, sidebarWidth } = data;
  const contentKey = JSON.stringify({
    workspaces,
    groups: groups ?? [],
    sidebarOrder: sidebarOrder ?? [],
    activeWorkspaceId,
    sidebarCollapsed,
    sidebarWidth,
  });

  if (g.__purplemuxWorkspacesContentCache === contentKey) return;

  data.updatedAt = new Date().toISOString();
  const tmpFile = WORKSPACES_FILE + '.tmp';
  try {
    await fs.writeFile(tmpFile, JSON.stringify(data, null, 2), { mode: 0o600 });
    await fs.rename(tmpFile, WORKSPACES_FILE);
  } catch (err) {
    await fs.unlink(tmpFile).catch(() => {});
    throw err;
  }

  g.__purplemuxWorkspacesContentCache = contentKey;
  broadcastSync({ type: 'workspace' });
};

const migrateFromPhase4 = async (): Promise<IWorkspacesData | null> => {
  const legacyLayout = await readLayoutFile(LEGACY_LAYOUT_FILE);
  if (!legacyLayout) return null;

  const wsId = 'ws-default';
  await fs.mkdir(resolveLayoutDir(wsId), { recursive: true });
  await writeLayoutFile(legacyLayout, resolveLayoutFile(wsId));

  const data: IWorkspacesData = {
    workspaces: [{
      id: wsId,
      name: 'default',
      directories: [os.homedir()],
    }],
    sidebarCollapsed: false,
    sidebarWidth: 240,
    updatedAt: legacyLayout.updatedAt || new Date().toISOString(),
  };

  await writeWorkspacesFile(data);
  log.info(`Phase 4 layout.json → Workspace 'default' migration complete`);
  return data;
};

const migrateFromTabs = async (): Promise<IWorkspacesData | null> => {
  try {
    const raw = await fs.readFile(LEGACY_TABS_FILE, 'utf-8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.tabs) || data.tabs.length === 0) return null;

    const paneId = `pane-${nanoid(6)}`;
    const legacyLayout: ILayoutData = {
      root: {
        type: 'pane',
        id: paneId,
        tabs: data.tabs,
        activeTabId: data.activeTabId ?? null,
      },
      activePaneId: paneId,
      updatedAt: new Date().toISOString(),
    };

    const tmpFile = LEGACY_LAYOUT_FILE + '.tmp';
    try {
      await fs.writeFile(tmpFile, JSON.stringify(legacyLayout, null, 2), { mode: 0o600 });
      await fs.rename(tmpFile, LEGACY_LAYOUT_FILE);
    } catch (err) {
      await fs.unlink(tmpFile).catch(() => {});
      throw err;
    }
    log.info('tabs.json → layout.json migration complete');

    return await migrateFromPhase4();
  } catch {
    return null;
  }
};

export const initWorkspaceStore = async (): Promise<void> => {
  await fs.mkdir(path.join(BASE_DIR, 'workspaces'), { recursive: true });

  let data = await readWorkspacesFile();

  if (!data) {
    const layoutExists = await fs.access(LEGACY_LAYOUT_FILE).then(() => true).catch(() => false);
    if (layoutExists) {
      data = await migrateFromPhase4();
    } else {
      const tabsExists = await fs.access(LEGACY_TABS_FILE).then(() => true).catch(() => false);
      if (tabsExists) {
        data = await migrateFromTabs();
      }
    }
  }

  if (!data) {
    const state = emptyState();
    await writeWorkspacesFile(state);
    data = state;
    log.info('Initial workspaces.json created');
  }

  if (data.workspaces.length === 0) {
    return;
  }

  const allTmuxSessions = await listSessions();

  for (const ws of data.workspaces) {
    const layoutFile = resolveLayoutFile(ws.id);
    let layout = await readLayoutFile(layoutFile);

    if (!layout) {
      log.warn(`Workspace '${ws.name}': layout.json corrupted, reset to default pane`);
      layout = await createDefaultLayout(ws.id, ws.directories[0]);
      await writeLayoutFile(layout, layoutFile);
      continue;
    }

    const wsTabs = collectAllTabs(layout.root);
    const wsSessionNames = wsTabs.map((t) => t.sessionName);

    const wsPrefix = `pt-${ws.id}-`;
    const relevantTmuxSessions = allTmuxSessions.filter(
      (s) => wsSessionNames.includes(s) || s.startsWith(wsPrefix),
    );

    try {
      const changed = await crossCheckLayout(layout, relevantTmuxSessions, ws.id, ws.directories[0]);
      if (changed) {
        await writeLayoutFile(layout, layoutFile);
      }
    } catch (err) {
      log.error(`Workspace '${ws.name}': tmux consistency check failed: ${err instanceof Error ? err.message : err}`);
    }

  }
};

export const getWorkspaces = async (): Promise<{
  workspaces: IWorkspace[];
  groups: IWorkspaceGroup[];
  sidebarOrder: TWorkspaceSidebarItem[];
  activeWorkspaceId?: string;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
}> => {
  const data = await readWorkspacesFile();
  if (!data) return { workspaces: [], groups: [], sidebarOrder: [], sidebarCollapsed: false, sidebarWidth: 220 };

  return {
    workspaces: data.workspaces,
    groups: data.groups ?? [],
    sidebarOrder: normalizeWorkspaceHierarchy(
      data.workspaces,
      data.groups ?? [],
      data.sidebarOrder,
    ).sidebarOrder,
    activeWorkspaceId: data.activeWorkspaceId,
    sidebarCollapsed: data.sidebarCollapsed,
    sidebarWidth: data.sidebarWidth,
  };
};

export const getActiveWorkspaceId = async (): Promise<string | null> => {
  const data = await readWorkspacesFile();
  if (data?.activeWorkspaceId && data.workspaces.some((w) => w.id === data.activeWorkspaceId)) {
    return data.activeWorkspaceId;
  }
  return data?.workspaces[0]?.id ?? null;
};

export const getWorkspaceById = async (wsId: string): Promise<IWorkspace | undefined> => {
  const data = await readWorkspacesFile();
  return data?.workspaces.find((w) => w.id === wsId);
};

const resolveWorkspaceDirectory = (directory: string): string => {
  const trimmed = directory.trim();
  if (trimmed === '~') return os.homedir();
  if (trimmed.startsWith('~/')) return path.join(os.homedir(), trimmed.slice(2));
  return trimmed;
};

const validateWorkspaceDirectories = async (directories: string[]): Promise<string[]> => {
  const resolved = [...new Set(directories.map(resolveWorkspaceDirectory).filter(Boolean))];
  if (resolved.length === 0) resolved.push(os.homedir());

  for (const directory of resolved) {
    let stat;
    try {
      stat = await fs.stat(directory);
    } catch {
      throw new Error(`Directory does not exist: ${directory}`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`Please enter a directory path, not a file: ${directory}`);
    }
  }
  return resolved;
};

export interface ICreateWorkspaceDetails {
  directories: string[];
  name?: string;
  groupPath?: string;
  layoutOptions?: ICreateLayoutOptions;
}

export const createWorkspaceWithDetails = async ({
  directories,
  name,
  groupPath,
  layoutOptions,
}: ICreateWorkspaceDetails): Promise<IWorkspace> =>
  withLock(async () => {
    const resolvedDirectories = await validateWorkspaceDirectories(directories);
    const groupSegments = groupPath === undefined ? [] : parseWorkspaceGroupPath(groupPath);

    const data = (await readWorkspacesFile()) ?? emptyState();
    const hierarchy = normalizeWorkspaceHierarchy(
      data.workspaces,
      ensureGroups(data),
      data.sidebarOrder,
    );
    data.workspaces = hierarchy.workspaces;
    data.groups = hierarchy.groups;
    data.sidebarOrder = hierarchy.sidebarOrder;

    const groupResult = ensureWorkspaceGroupPath(
      data.groups,
      data.sidebarOrder,
      groupSegments,
      () => `grp-${nanoid(6)}`,
    );
    data.groups = groupResult.groups;
    data.sidebarOrder = groupResult.sidebarOrder;

    const wsId = `ws-${nanoid(6)}`;
    const wsName = name?.trim() || nextWorkspaceName(data.workspaces);

    const layout = await createDefaultLayout(wsId, resolvedDirectories[0], layoutOptions);
    await fs.mkdir(resolveLayoutDir(wsId), { recursive: true });
    await writeLayoutFile(layout, resolveLayoutFile(wsId));

    const workspace: IWorkspace = {
      id: wsId,
      name: wsName,
      directories: resolvedDirectories,
      ...(groupResult.groupId ? { groupId: groupResult.groupId } : {}),
    };
    data.workspaces.push(workspace);
    const workspaceOrder = groupResult.groupId
      ? data.groups.find((group) => group.id === groupResult.groupId)?.childOrder
      : data.sidebarOrder;
    workspaceOrder?.push({ type: 'workspace', id: wsId });
    await writeWorkspacesFile(data);
    await writeWorkspacePrompts(workspace);

    log.debug(`Created: ${wsId} (${wsName}, ${resolvedDirectories.join(', ')})`);
    return workspace;
  });

export const createWorkspace = async (
  directory: string,
  name?: string,
  layoutOptions?: ICreateLayoutOptions,
): Promise<IWorkspace> => createWorkspaceWithDetails({
  directories: [directory],
  name,
  layoutOptions,
});

export interface IWorkspaceTabTransferResult extends ITabWorkspaceLayoutTransferResult {
  targetWorkspace: IWorkspace;
  sourceWorkspaceRemoved: boolean;
}

const finalizeWorkspaceTabTransfer = async (
  data: IWorkspacesData,
  sourceWorkspaceId: string,
  targetWorkspace: IWorkspace,
  tabId: string,
  transfer: ITabWorkspaceLayoutTransferResult,
): Promise<IWorkspaceTabTransferResult> => {
  relocateWorkspaceTeamTab(data, tabId, sourceWorkspaceId, targetWorkspace.id);
  if (transfer.sourceEmpty) {
    data.workspaces = data.workspaces.filter((workspace) => workspace.id !== sourceWorkspaceId);
    if (data.activeWorkspaceId === sourceWorkspaceId) data.activeWorkspaceId = targetWorkspace.id;
  }
  normalizeWorkspaceOrder(data);
  await writeWorkspacesFile(data);
  if (transfer.sourceEmpty) await removeLayoutFile(sourceWorkspaceId);
  return {
    ...transfer,
    targetWorkspace,
    sourceWorkspaceRemoved: transfer.sourceEmpty,
  };
};

export const transferTabToWorkspace = async (
  sourceWorkspaceId: string,
  sourcePaneId: string,
  tabId: string,
  targetWorkspaceId: string,
): Promise<IWorkspaceTabTransferResult | null> =>
  withLock(async () => {
    const data = (await readWorkspacesFile()) ?? emptyState();
    const sourceWorkspace = data.workspaces.find((workspace) => workspace.id === sourceWorkspaceId);
    const targetWorkspace = data.workspaces.find((workspace) => workspace.id === targetWorkspaceId);
    if (!sourceWorkspace || !targetWorkspace || sourceWorkspaceId === targetWorkspaceId) return null;

    const transfer = await moveTabBetweenWorkspaces(
      sourceWorkspaceId,
      sourcePaneId,
      tabId,
      targetWorkspaceId,
    );
    if (!transfer) return null;
    return finalizeWorkspaceTabTransfer(data, sourceWorkspaceId, targetWorkspace, tabId, transfer);
  });

export const transferTabToNewWorkspace = async (
  sourceWorkspaceId: string,
  sourcePaneId: string,
  tabId: string,
): Promise<IWorkspaceTabTransferResult | null> =>
  withLock(async () => {
    const data = (await readWorkspacesFile()) ?? emptyState();
    const sourceWorkspace = data.workspaces.find((workspace) => workspace.id === sourceWorkspaceId);
    if (!sourceWorkspace) return null;

    const sourceLayout = await readLayoutFile(resolveLayoutFile(sourceWorkspaceId));
    const sourceTab = sourceLayout
      ? collectAllTabs(sourceLayout.root).find((tab) => tab.id === tabId)
      : null;
    if (!sourceTab) return null;

    const directory = await resolveExistingDir(sourceTab.cwd ?? sourceWorkspace.directories[0]);
    const targetWorkspace: IWorkspace = {
      id: `ws-${nanoid(6)}`,
      name: nextWorkspaceName(data.workspaces),
      directories: [directory],
    };
    data.workspaces.push(targetWorkspace);
    normalizeWorkspaceOrder(data);
    await writeWorkspacesFile(data);

    const transfer = await moveTabBetweenWorkspaces(
      sourceWorkspaceId,
      sourcePaneId,
      tabId,
      targetWorkspace.id,
    );
    if (!transfer) {
      data.workspaces = data.workspaces.filter((workspace) => workspace.id !== targetWorkspace.id);
      normalizeWorkspaceOrder(data);
      await writeWorkspacesFile(data);
      await removeLayoutFile(targetWorkspace.id).catch(() => {});
      return null;
    }

    const result = await finalizeWorkspaceTabTransfer(
      data,
      sourceWorkspaceId,
      targetWorkspace,
      tabId,
      transfer,
    );
    await writeWorkspacePrompts(targetWorkspace);
    return result;
  });

export const deleteWorkspace = async (workspaceId: string): Promise<boolean> =>
  withLock(async () => {
    const data = (await readWorkspacesFile()) ?? emptyState();
    const idx = data.workspaces.findIndex((w) => w.id === workspaceId);
    if (idx === -1) return false;

    const ws = data.workspaces[idx];

    const layout = await readLayoutFile(resolveLayoutFile(workspaceId));
    if (layout) {
      const tabs = collectAllTabs(layout.root);
      for (const tab of tabs.filter((candidate) => panelUsesTmux(candidate.panelType))) {
        try {
          await killSession(tab.sessionName);
        } catch {}
      }
    }

    try {
      await removeLayoutFile(workspaceId);
    } catch {}

    data.workspaces.splice(idx, 1);
    await writeWorkspacesFile(data);
    log.info(`Deleted: ${workspaceId} (${ws.name})`);
    return true;
  });

export const renameWorkspace = async (workspaceId: string, name: string): Promise<IWorkspace | null> =>
  withLock(async () => {
    const data = await readWorkspacesFile();
    if (!data) return null;

    const ws = data.workspaces.find((w) => w.id === workspaceId);
    if (!ws) return null;

    ws.name = name;
    await writeWorkspacesFile(data);
    await writeWorkspacePrompts(ws);

    log.debug(`Renamed: ${workspaceId} → "${name}"`);
    return { ...ws };
  });

export const updateActive = async (updates: {
  activeWorkspaceId?: string;
  sidebarCollapsed?: boolean;
  sidebarWidth?: number;
}): Promise<void> =>
  withLock(async () => {
    const data = (await readWorkspacesFile()) ?? emptyState();
    if (updates.activeWorkspaceId !== undefined) data.activeWorkspaceId = updates.activeWorkspaceId;
    if (updates.sidebarCollapsed !== undefined) data.sidebarCollapsed = updates.sidebarCollapsed;
    if (updates.sidebarWidth !== undefined) data.sidebarWidth = updates.sidebarWidth;
    await writeWorkspacesFile(data);
  });

export const updateWorkspaceDirectories = async (workspaceId: string, directories: string[]): Promise<void> =>
  withLock(async () => {
    const data = await readWorkspacesFile();
    if (!data) return;
    const ws = data.workspaces.find((w) => w.id === workspaceId);
    if (!ws) return;
    const current = JSON.stringify(ws.directories);
    if (current === JSON.stringify(directories)) return;
    ws.directories = directories;
    await writeWorkspacesFile(data);
    await writeWorkspacePrompts(ws);
  });

export interface IReorderItem {
  id: string;
  groupId?: string | null;
}

export interface IReorderGroupItem {
  id: string;
  parentId?: string | null;
  childOrder?: TWorkspaceSidebarItem[];
}

export const reorderWorkspaces = async (
  items: IReorderItem[],
  sidebarOrder?: TWorkspaceSidebarItem[],
  groupItems?: IReorderGroupItem[],
): Promise<boolean> =>
  withLock(async () => {
    const data = (await readWorkspacesFile()) ?? emptyState();
    const byId = new Map(data.workspaces.map((w) => [w.id, w]));
    const groups = data.groups ?? [];
    const validGroupIds = new Set(groups.map((g) => g.id));

    if (groupItems) {
      if (groupItems.length !== groups.length) return false;
      const groupById = new Map(groups.map((group) => [group.id, group]));
      const reorderedGroups: IWorkspaceGroup[] = [];
      for (const item of groupItems) {
        const group = groupById.get(item.id);
        if (!group || reorderedGroups.some((candidate) => candidate.id === item.id)) return false;
        group.parentId = item.parentId && validGroupIds.has(item.parentId) ? item.parentId : null;
        group.childOrder = item.childOrder;
        reorderedGroups.push(group);
      }
      data.groups = reorderedGroups;
    }

    const reordered: IWorkspace[] = [];
    for (const item of items) {
      const ws = byId.get(item.id);
      if (!ws) return false;
      if (item.groupId !== undefined) {
        const nextGroupId = item.groupId && validGroupIds.has(item.groupId) ? item.groupId : null;
        ws.groupId = nextGroupId;
      }
      reordered.push(ws);
    }

    if (reordered.length !== data.workspaces.length) return false;

    data.workspaces = reordered;
    if (sidebarOrder) data.sidebarOrder = sidebarOrder;
    await writeWorkspacesFile(data);
    return true;
  });

export const createGroup = async (name: string): Promise<IWorkspaceGroup> =>
  withLock(async () => {
    const data = (await readWorkspacesFile()) ?? emptyState();
    const groups = ensureGroups(data);
    const trimmed = name.trim() || `Group ${groups.length + 1}`;
    const group: IWorkspaceGroup = {
      id: `grp-${nanoid(6)}`,
      name: trimmed,
      collapsed: false,
      parentId: null,
      childOrder: [],
    };
    groups.push(group);
    data.sidebarOrder = [...(data.sidebarOrder ?? []), { type: 'group', id: group.id }];
    await writeWorkspacesFile(data);
    log.debug(`Group created: ${group.id} (${group.name})`);
    return group;
  });

export const renameGroup = async (groupId: string, name: string): Promise<IWorkspaceGroup | null> =>
  withLock(async () => {
    const data = await readWorkspacesFile();
    if (!data) return null;
    const group = (data.groups ?? []).find((g) => g.id === groupId);
    if (!group) return null;
    const trimmed = name.trim();
    if (!trimmed) return group;
    group.name = trimmed;
    await writeWorkspacesFile(data);
    return { ...group };
  });

export const setGroupCollapsed = async (groupId: string, collapsed: boolean): Promise<boolean> =>
  withLock(async () => {
    const data = await readWorkspacesFile();
    if (!data) return false;
    const group = (data.groups ?? []).find((g) => g.id === groupId);
    if (!group) return false;
    if (group.collapsed === collapsed) return true;
    group.collapsed = collapsed;
    await writeWorkspacesFile(data);
    return true;
  });

export const setGroupColor = async (
  groupId: string,
  color: TWorkspaceGroupColor,
): Promise<IWorkspaceGroup | null> =>
  withLock(async () => {
    const data = await readWorkspacesFile();
    if (!data) return null;
    const group = (data.groups ?? []).find((candidate) => candidate.id === groupId);
    if (!group) return null;
    group.color = color;
    await writeWorkspacesFile(data);
    return { ...group };
  });

export const setGroupTeam = async (
  groupId: string,
  team: IWorkspaceTeamConfig | null,
): Promise<IWorkspaceGroup | null> =>
  withLock(async () => {
    const data = await readWorkspacesFile();
    if (!data) return null;
    const group = (data.groups ?? []).find((candidate) => candidate.id === groupId);
    if (!group) return null;
    if (team) {
      group.team = team;
    } else {
      delete group.team;
    }
    await writeWorkspacesFile(data);
    return { ...group };
  });

export const ungroupGroup = async (groupId: string): Promise<boolean> =>
  withLock(async () => {
    const data = await readWorkspacesFile();
    if (!data) return false;
    const hierarchy = removeWorkspaceGroupFromHierarchy(
      data.workspaces,
      ensureGroups(data),
      data.sidebarOrder ?? [],
      groupId,
    );
    if (!hierarchy) return false;
    data.workspaces = hierarchy.workspaces;
    data.groups = hierarchy.groups;
    data.sidebarOrder = hierarchy.sidebarOrder;
    await writeWorkspacesFile(data);
    log.info(`Group ungrouped: ${groupId}`);
    return true;
  });

export const reorderGroups = async (groupIds: string[]): Promise<boolean> =>
  withLock(async () => {
    const data = await readWorkspacesFile();
    if (!data) return false;
    const groups = ensureGroups(data);
    const byId = new Map(groups.map((g) => [g.id, g]));
    const reordered: IWorkspaceGroup[] = [];
    for (const id of groupIds) {
      const g = byId.get(id);
      if (!g) return false;
      reordered.push(g);
    }
    if (reordered.length !== groups.length) return false;
    data.groups = reordered;
    await writeWorkspacesFile(data);
    return true;
  });

export const setWorkspaceGroup = async (workspaceId: string, groupId: string | null): Promise<boolean> =>
  withLock(async () => {
    const data = await readWorkspacesFile();
    if (!data) return false;
    const ws = data.workspaces.find((w) => w.id === workspaceId);
    if (!ws) return false;
    const groups = data.groups ?? [];
    const validGroupIds = new Set(groups.map((g) => g.id));
    const nextGroupId = groupId && validGroupIds.has(groupId) ? groupId : null;
    if ((ws.groupId ?? null) === nextGroupId) return true;
    const hierarchy = normalizeWorkspaceHierarchy(data.workspaces, groups, data.sidebarOrder);
    const targetOrder = nextGroupId
      ? hierarchy.groups.find((group) => group.id === nextGroupId)?.childOrder ?? []
      : hierarchy.sidebarOrder;
    const moved = moveWorkspaceHierarchyItem(
      hierarchy.workspaces,
      hierarchy.groups,
      hierarchy.sidebarOrder,
      { type: 'workspace', id: workspaceId },
      nextGroupId,
      targetOrder.length,
    );
    if (!moved) return false;
    data.workspaces = moved.workspaces;
    data.groups = moved.groups;
    data.sidebarOrder = moved.sidebarOrder;
    await writeWorkspacesFile(data);
    return true;
  });

export const validateDirectory = async (directory: string): Promise<{
  valid: boolean;
  error?: string;
  suggestedName?: string;
}> => {
  try {
    const stat = await fs.stat(directory);
    if (!stat.isDirectory()) {
      return { valid: false, error: 'Please enter a directory path, not a file' };
    }
  } catch {
    return { valid: false, error: 'Directory does not exist' };
  }

  return { valid: true, suggestedName: path.basename(directory) };
};
