import type { NextApiRequest, NextApiResponse } from 'next';
import {
  renameGroup,
  ungroupGroup,
  setGroupCollapsed,
  setGroupColor,
  setGroupTeam,
} from '@/lib/workspace-store';
import { validateWorkspaceTeamConfig } from '@/lib/workspace-team';
import { isWorkspaceGroupColor } from '@/lib/workspace-group-colors';
import type { IWorkspaceTeamConfig } from '@/types/terminal';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const groupId = req.query.groupId as string;

  if (req.method === 'DELETE') {
    const ok = await ungroupGroup(groupId);
    if (!ok) return res.status(404).json({ error: 'Group not found' });
    return res.status(204).end();
  }

  if (req.method === 'PATCH') {
    const { name, collapsed, color, team } = req.body ?? {};

    if (team !== undefined) {
      if (team === null) {
        const group = await setGroupTeam(groupId, null);
        if (!group) return res.status(404).json({ error: 'Group not found' });
        return res.status(200).json(group);
      }
      const config = team as Partial<IWorkspaceTeamConfig>;
      if (
        !config.orchestrator ||
        typeof config.orchestrator.workspaceId !== 'string' ||
        typeof config.orchestrator.tabId !== 'string' ||
        (config.workerTabOverrides !== undefined &&
          (typeof config.workerTabOverrides !== 'object' || Array.isArray(config.workerTabOverrides)))
      ) {
        return res.status(400).json({ error: 'Invalid team configuration' });
      }
      const normalized: IWorkspaceTeamConfig = {
        orchestrator: {
          workspaceId: config.orchestrator.workspaceId,
          tabId: config.orchestrator.tabId,
        },
        ...(config.workerTabOverrides
          ? { workerTabOverrides: Object.fromEntries(
              Object.entries(config.workerTabOverrides)
                .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
            ) }
          : {}),
      };
      const validationError = await validateWorkspaceTeamConfig(groupId, normalized);
      if (validationError) return res.status(400).json({ error: validationError });
      const group = await setGroupTeam(groupId, normalized);
      if (!group) return res.status(404).json({ error: 'Group not found' });
      return res.status(200).json(group);
    }

    if (collapsed !== undefined) {
      if (typeof collapsed !== 'boolean') {
        return res.status(400).json({ error: 'collapsed must be boolean' });
      }
      const ok = await setGroupCollapsed(groupId, collapsed);
      if (!ok) return res.status(404).json({ error: 'Group not found' });
      if (name === undefined) return res.status(200).json({ ok: true });
    }

    if (color !== undefined) {
      if (!isWorkspaceGroupColor(color)) {
        return res.status(400).json({ error: 'Invalid group color' });
      }
      const group = await setGroupColor(groupId, color);
      if (!group) return res.status(404).json({ error: 'Group not found' });
      return res.status(200).json(group);
    }

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'name required' });
      }
      const group = await renameGroup(groupId, name.trim());
      if (!group) return res.status(404).json({ error: 'Group not found' });
      return res.status(200).json(group);
    }

    return res.status(400).json({ error: 'name, collapsed, color, or team required' });
  }

  res.setHeader('Allow', 'DELETE, PATCH');
  return res.status(405).json({ error: 'Method not allowed' });
};

export default handler;
