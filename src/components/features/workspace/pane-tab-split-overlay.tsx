import {
  PanelBottomOpen,
  PanelLeftOpen,
  PanelRightOpen,
  PanelTopOpen,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { TTabSplitSide } from '@/lib/tab-drag-data';

interface IPaneTabSplitOverlayProps {
  side: TTabSplitSide;
}

const TARGETS = [
  { side: 'left', Icon: PanelLeftOpen, className: 'inset-y-2 left-2 w-[28%]' },
  { side: 'right', Icon: PanelRightOpen, className: 'inset-y-2 right-2 w-[28%]' },
  { side: 'top', Icon: PanelTopOpen, className: 'inset-x-[29%] top-2 h-[28%]' },
  { side: 'bottom', Icon: PanelBottomOpen, className: 'inset-x-[29%] bottom-2 h-[28%]' },
] as const;

const PaneTabSplitOverlay = ({ side }: IPaneTabSplitOverlayProps) => {
  const t = useTranslations('terminal');
  return (
    <div className="pointer-events-none absolute inset-0 z-50 bg-background/20">
      {TARGETS.map(({ side: targetSide, Icon, className }) => {
        const active = side === targetSide;
        return (
          <div
            key={targetSide}
            className={cn(
              'absolute flex items-center justify-center rounded-md border border-dashed border-border/70 bg-background/65 text-muted-foreground transition-[background-color,border-color,color,opacity] duration-100',
              className,
              active
                ? 'border-focus-indicator bg-accent text-foreground opacity-100'
                : 'opacity-45',
            )}
          >
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <Icon className="h-4 w-4" />
              {active && <span>{t('splitTabHere')}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default PaneTabSplitOverlay;
