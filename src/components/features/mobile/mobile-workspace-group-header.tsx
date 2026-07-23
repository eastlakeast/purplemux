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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { WORKSPACE_GROUP_COLORS } from '@/lib/workspace-group-colors';
import type { IWorkspaceGroup, TWorkspaceGroupColor } from '@/types/terminal';

interface IMobileWorkspaceGroupHeaderProps {
  group: IWorkspaceGroup;
  count: number;
  onToggle: (groupId: string) => void;
  onRenameRequest: (groupId: string) => void;
  onUngroup: (groupId: string) => void;
  onColorChange: (groupId: string, color: TWorkspaceGroupColor) => void;
}

const MobileWorkspaceGroupHeader = ({
  group,
  count,
  onToggle,
  onRenameRequest,
  onUngroup,
  onColorChange,
}: IMobileWorkspaceGroupHeaderProps) => {
  const t = useTranslations('sidebar');
  const [menuOpen, setMenuOpen] = useState(false);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);

  const handleToggle = useCallback(() => {
    onToggle(group.id);
  }, [group.id, onToggle]);

  const handleRenameAction = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    onRenameRequest(group.id);
  }, [group.id, onRenameRequest]);

  const handleUngroupAction = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    onUngroup(group.id);
  }, [group.id, onUngroup]);

  const Icon = group.collapsed ? ChevronRight : ChevronDown;

  return (
    <div
      className="flex items-center gap-2 px-4 text-xs font-medium tracking-wide text-muted-foreground"
      onClick={handleToggle}
    >
      <Icon size={12} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        {group.name} <span className="text-muted-foreground/60">({count})</span>
      </span>
      {group.team && <Network size={12} className="shrink-0 text-[var(--focus-indicator)]" />}
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
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent/50"
              onClick={(e) => e.stopPropagation()}
              aria-label={t('renameGroup')}
            />
          }
        >
          <MoreHorizontal size={14} />
        </PopoverTrigger>
        <PopoverContent side="bottom" align="end" className="w-44 gap-0 p-1">
          <Popover open={colorMenuOpen} onOpenChange={setColorMenuOpen}>
            <PopoverTrigger
              render={
                <button
                  className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm transition-colors hover:bg-accent"
                  onClick={(e) => e.stopPropagation()}
                />
              }
            >
              <Palette size={14} />
              <span className="flex-1">{t('groupColor')}</span>
              <span
                className="h-3.5 w-3.5 rounded-sm border border-foreground/20"
                style={{
                  backgroundColor: WORKSPACE_GROUP_COLORS.find(
                    (color) => color.id === (group.color ?? 'neutral'),
                  )?.css,
                }}
              />
              <ChevronRight size={14} className="text-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent side="right" align="start" className="w-auto gap-0 p-2">
              <div className="grid grid-cols-4 gap-2">
                {WORKSPACE_GROUP_COLORS.map((color) => {
                  const selected = (group.color ?? 'neutral') === color.id;
                  return (
                    <button
                      key={color.id}
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded border border-border',
                        selected && 'ring-1 ring-[var(--focus-indicator)]',
                      )}
                      style={{ backgroundColor: color.css }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onColorChange(group.id, color.id);
                        setColorMenuOpen(false);
                      }}
                      aria-label={t('groupColor')}
                    >
                      {selected && <Check size={14} className="text-white drop-shadow" />}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
          <button
            className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm transition-colors hover:bg-accent"
            onClick={handleRenameAction}
          >
            <Pencil size={14} />
            {t('renameGroup')}
          </button>
          <button
            className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm transition-colors hover:bg-accent"
            onClick={handleUngroupAction}
          >
            <FolderMinus size={14} />
            {t('ungroup')}
          </button>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default memo(MobileWorkspaceGroupHeader);
