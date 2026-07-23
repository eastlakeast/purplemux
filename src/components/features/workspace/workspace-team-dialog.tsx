import { useMemo, useState } from 'react';
import { Bot, Network, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import Spinner from '@/components/ui/spinner';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import { getWorkspaceGroupDescendantIds } from '@/lib/workspace-order';
import type { ITab, IWorkspace, IWorkspaceGroup, IWorkspaceTeamConfig } from '@/types/terminal';

const AUTOMATIC = '__automatic__';
const isTeamAgentTab = (tab: ITab): boolean =>
  tab.panelType === 'claude-code' || tab.panelType === 'codex-cli';

interface IWorkspaceTeamDialogProps {
  group: IWorkspaceGroup | null;
  workspaces: IWorkspace[];
  workspaceTabs: Record<string, ITab[]>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface IAgentTabOption {
  workspace: IWorkspace;
  tab: ITab;
  value: string;
  label: string;
}

const tabLabel = (tab: ITab): string => tab.name || tab.title || tab.panelType || tab.id;

const WorkspaceTeamDialog = ({
  group,
  workspaces,
  workspaceTabs,
  open,
  onOpenChange,
}: IWorkspaceTeamDialogProps) => {
  const t = useTranslations('sidebar');
  const tc = useTranslations('common');
  const groups = useWorkspaceStore((state) => state.groups);
  const memberGroupIds = useMemo(
    () => group ? getWorkspaceGroupDescendantIds(groups, group.id) : new Set<string>(),
    [group, groups],
  );
  const options = useMemo<IAgentTabOption[]>(() => {
    if (!group) return [];
    return workspaces
      .filter((workspace) => workspace.groupId && memberGroupIds.has(workspace.groupId))
      .flatMap((workspace) => (workspaceTabs[workspace.id] ?? [])
        .filter(isTeamAgentTab)
        .map((tab) => ({
          workspace,
          tab,
          value: `${workspace.id}/${tab.id}`,
          label: `${workspace.name} / ${tabLabel(tab)}`,
        })));
  }, [group, memberGroupIds, workspaces, workspaceTabs]);

  const configuredOrchestrator = group?.team
    ? `${group.team.orchestrator.workspaceId}/${group.team.orchestrator.tabId}`
    : '';
  const initialOrchestrator = options.some((option) => option.value === configuredOrchestrator)
    ? configuredOrchestrator
    : options[0]?.value ?? '';
  const [orchestratorValue, setOrchestratorValue] = useState(initialOrchestrator);
  const [overrides, setOverrides] = useState<Record<string, string>>(
    group?.team?.workerTabOverrides ?? {},
  );
  const [isSaving, setIsSaving] = useState(false);
  const [resetKey, setResetKey] = useState(`${open}:${group?.id ?? ''}:${configuredOrchestrator}`);
  const nextResetKey = `${open}:${group?.id ?? ''}:${configuredOrchestrator}`;
  if (resetKey !== nextResetKey) {
    setResetKey(nextResetKey);
    setOrchestratorValue(initialOrchestrator);
    setOverrides(group?.team?.workerTabOverrides ?? {});
    setIsSaving(false);
  }

  const orchestrator = options.find((option) => option.value === orchestratorValue) ?? null;
  const groupWorkspaces = group
    ? workspaces.filter((workspace) => workspace.groupId && memberGroupIds.has(workspace.groupId))
    : [];
  const workerWorkspaces = groupWorkspaces.filter(
    (workspace) => workspace.id !== orchestrator?.workspace.id,
  );

  const handleSave = async () => {
    if (!group || !orchestrator) return;
    const workerTabOverrides = Object.fromEntries(
      Object.entries(overrides).filter(([workspaceId, tabId]) =>
        workspaceId !== orchestrator.workspace.id &&
        (workspaceTabs[workspaceId] ?? []).some((tab) => tab.id === tabId && isTeamAgentTab(tab)),
      ),
    );
    const team: IWorkspaceTeamConfig = {
      orchestrator: {
        workspaceId: orchestrator.workspace.id,
        tabId: orchestrator.tab.id,
      },
      ...(Object.keys(workerTabOverrides).length > 0 ? { workerTabOverrides } : {}),
    };
    setIsSaving(true);
    const ok = await useWorkspaceStore.getState().updateGroupTeam(group.id, team);
    setIsSaving(false);
    if (ok) {
      toast.success(t('teamSaved'));
      onOpenChange(false);
    }
  };

  const handleDisable = async () => {
    if (!group) return;
    setIsSaving(true);
    const ok = await useWorkspaceStore.getState().updateGroupTeam(group.id, null);
    setIsSaving(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Network className="h-4 w-4" />
            {t('sessionTeam')}
          </DialogTitle>
        </DialogHeader>

        {options.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {t('teamNoAgentTabs')}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">{t('teamOrchestrator')}</div>
              <Select
                items={options.map((option) => ({ value: option.value, label: option.label }))}
                value={orchestratorValue}
                onValueChange={(value) => {
                  setOrchestratorValue(value ?? '');
                  const workspaceId = options.find((option) => option.value === value)?.workspace.id;
                  if (workspaceId) {
                    setOverrides((current) => {
                      const next = { ...current };
                      delete next[workspaceId];
                      return next;
                    });
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">{t('teamWorkers')}</div>
              <div className="divide-y divide-border border-y border-border">
                {workerWorkspaces.map((workspace) => {
                  const tabs = (workspaceTabs[workspace.id] ?? []).filter(isTeamAgentTab);
                  const selected = overrides[workspace.id] ?? AUTOMATIC;
                  const automaticLabel = tabs[0]
                    ? `${t('teamAutomatic')} / ${tabLabel(tabs[0])}`
                    : t('teamUnavailable');
                  const items = [
                    { value: AUTOMATIC, label: automaticLabel },
                    ...tabs.map((tab) => ({ value: tab.id, label: tabLabel(tab) })),
                  ];
                  return (
                    <div key={workspace.id} className="flex min-h-12 items-center gap-3 py-2">
                      <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-sm">{workspace.name}</span>
                      <Select
                        items={items}
                        value={tabs.some((tab) => tab.id === selected) ? selected : AUTOMATIC}
                        onValueChange={(value) => setOverrides((current) => {
                          const next = { ...current };
                          if (!value || value === AUTOMATIC) {
                            delete next[workspace.id];
                          } else {
                            next[workspace.id] = value;
                          }
                          return next;
                        })}
                        disabled={tabs.length === 0}
                      >
                        <SelectTrigger className="w-52 max-w-[55%]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {items.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="sm:justify-between">
          <div>
            {group?.team && (
              <Button variant="destructive" onClick={handleDisable} disabled={isSaving}>
                <Trash2 className="h-3.5 w-3.5" />
                {t('teamDisable')}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              {tc('cancel')}
            </Button>
            <Button onClick={handleSave} disabled={!orchestrator || isSaving}>
              {isSaving && <Spinner className="h-3.5 w-3.5" />}
              {tc('save')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WorkspaceTeamDialog;
