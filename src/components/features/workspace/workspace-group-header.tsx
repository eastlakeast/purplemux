import { useCallback, useState, memo } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  FolderMinus,
  MoreHorizontal,
  Network,
  Palette,
  Pencil,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import useInlineEdit from '@/hooks/use-inline-edit';
import { WORKSPACE_GROUP_COLORS } from '@/lib/workspace-group-colors';
import type { IWorkspaceGroup, TWorkspaceGroupColor } from '@/types/terminal';

interface IWorkspaceGroupHeaderProps {
  group: IWorkspaceGroup;
  count: number;
  onToggle: (groupId: string) => void;
  onRename: (groupId: string, name: string) => void;
  onUngroup: (groupId: string) => void;
  onConfigureTeam: (groupId: string) => void;
  onColorChange: (groupId: string, color: TWorkspaceGroupColor) => void;
}

const WorkspaceGroupHeader = ({
  group,
  count,
  onToggle,
  onRename,
  onUngroup,
  onConfigureTeam,
  onColorChange,
}: IWorkspaceGroupHeaderProps) => {
  const t = useTranslations('sidebar');
  const [menuOpen, setMenuOpen] = useState(false);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const { isEditing, draft, setDraft, inputRef, startEditing, commit, handleKeyDown } =
    useInlineEdit({
      value: group.name,
      onCommit: (next) => onRename(group.id, next),
    });

  const handleToggle = useCallback(() => {
    if (!isEditing) onToggle(group.id);
  }, [isEditing, group.id, onToggle]);

  const handleRenameAction = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    startEditing();
  }, [startEditing]);

  const handleUngroupAction = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    onUngroup(group.id);
  }, [group.id, onUngroup]);

  const handleConfigureTeam = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    onConfigureTeam(group.id);
  }, [group.id, onConfigureTeam]);

  const Icon = group.collapsed ? ChevronRight : ChevronDown;

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="group relative flex h-7 cursor-pointer items-center gap-1 px-2 text-[11px] font-medium tracking-wide text-muted-foreground hover:bg-sidebar-accent/50"
        onClick={handleToggle}
        render={<div />}
      >
        <Icon className="h-3 w-3 shrink-0" />
        {isEditing ? (
          <input
            ref={inputRef}
            className="min-w-0 flex-1 bg-transparent p-0 text-[11px] font-medium tracking-wide text-foreground outline-none"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commit}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate">
            {group.name} <span className="text-muted-foreground/60">({count})</span>
          </span>
        )}
        {group.team && (
          <Network
            className="h-3 w-3 shrink-0 text-[var(--focus-indicator)]"
            aria-label={t('sessionTeam')}
          />
        )}
        <Popover
          open={menuOpen}
          onOpenChange={(open) => {
            setMenuOpen(open);
            if (!open) setColorMenuOpen(false);
          }}
        >
          <PopoverTrigger
            render={
              <button
                className={cn(
                  'ml-0.5 flex h-5 w-5 items-center justify-center rounded transition-opacity hover:bg-sidebar-accent',
                  menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                )}
                onClick={(e) => e.stopPropagation()}
                aria-label={t('renameGroup')}
              />
            }
          >
            <MoreHorizontal className="h-3 w-3" />
          </PopoverTrigger>
          <PopoverContent side="right" align="start" className="w-44 gap-0 p-1">
            <button
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
              onClick={handleConfigureTeam}
            >
              <Network className="h-3.5 w-3.5" />
              {t('sessionTeam')}
            </button>
            <Popover open={colorMenuOpen} onOpenChange={setColorMenuOpen}>
              <PopoverTrigger
                render={
                  <button
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                    onClick={(e) => e.stopPropagation()}
                  />
                }
              >
                <Palette className="h-3.5 w-3.5" />
                <span className="flex-1">{t('groupColor')}</span>
                <span
                  className="h-3 w-3 rounded-sm border border-foreground/20"
                  style={{
                    backgroundColor: WORKSPACE_GROUP_COLORS.find(
                      (color) => color.id === (group.color ?? 'neutral'),
                    )?.css,
                  }}
                />
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </PopoverTrigger>
              <PopoverContent side="right" align="start" className="w-auto gap-0 p-2">
                <div className="grid grid-cols-4 gap-1.5">
                  {WORKSPACE_GROUP_COLORS.map((color) => {
                    const selected = (group.color ?? 'neutral') === color.id;
                    return (
                      <button
                        key={color.id}
                        className={cn(
                          'flex h-6 w-6 items-center justify-center rounded border border-border',
                          selected && 'ring-1 ring-[var(--focus-indicator)]',
                        )}
                        style={{ backgroundColor: color.css }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onColorChange(group.id, color.id);
                          setColorMenuOpen(false);
                        }}
                        aria-label={t('groupColor')}
                        title={t('groupColor')}
                      >
                        {selected && <Check className="h-3.5 w-3.5 text-white drop-shadow" />}
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
            <button
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
              onClick={handleRenameAction}
            >
              <Pencil className="h-3.5 w-3.5" />
              {t('renameGroup')}
            </button>
            <button
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
              onClick={handleUngroupAction}
            >
              <FolderMinus className="h-3.5 w-3.5" />
              {t('ungroup')}
            </button>
          </PopoverContent>
        </Popover>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={handleConfigureTeam}>
          <Network className="mr-2 h-3.5 w-3.5" />
          {t('sessionTeam')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleRenameAction}>
          <Pencil className="mr-2 h-3.5 w-3.5" />
          {t('renameGroup')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleUngroupAction}>
          <FolderMinus className="mr-2 h-3.5 w-3.5" />
          {t('ungroup')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export default memo(WorkspaceGroupHeader);
