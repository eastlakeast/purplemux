import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import useMessageHistory from '@/hooks/use-message-history';
import { useLayoutStore } from '@/hooks/use-layout';
import { buildPromptHistoryItems } from '@/lib/prompt-history';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ITimelineEntry } from '@/types/timeline';

interface IPromptHistoryRailProps {
  entries: ITimelineEntry[];
  onNavigate: (entryId: string) => void;
}

const MAX_MARKERS = 30;

const PromptHistoryRail = ({ entries, onNavigate }: IPromptHistoryRailProps) => {
  const t = useTranslations('timeline');
  const workspaceId = useLayoutStore((state) => state.workspaceId) ?? undefined;
  const { entries: userHistory } = useMessageHistory({ wsId: workspaceId });
  const [activeId, setActiveId] = useState<string | null>(null);
  const promptItems = useMemo(
    () => buildPromptHistoryItems(entries, userHistory).slice(-MAX_MARKERS),
    [entries, userHistory],
  );

  if (promptItems.length === 0) return null;

  return (
    <nav
      className="absolute inset-y-4 left-1 z-20 hidden w-5 flex-col justify-between sm:flex"
      aria-label={t('promptHistory')}
    >
      {promptItems.map((item) => (
        <Tooltip key={item.entryId}>
          <TooltipTrigger
            render={(
              <button
                type="button"
                className="group flex h-3 w-5 items-center justify-start rounded-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-indicator"
                onClick={() => {
                  setActiveId(item.entryId);
                  onNavigate(item.entryId);
                }}
                aria-label={t('jumpToPrompt', { prompt: item.prompt })}
              >
                <span
                  className={cn(
                    'h-0.5 w-2 rounded-full bg-muted-foreground/45 transition-[width,background-color] group-hover:w-4 group-hover:bg-foreground/80',
                    activeId === item.entryId && 'w-4 bg-foreground/80',
                  )}
                  aria-hidden="true"
                />
              </button>
            )}
          />
          <TooltipContent
            side="right"
            sideOffset={7}
            className="block w-80 max-w-[calc(100vw-3rem)] border border-border bg-popover px-4 py-3 text-left text-popover-foreground shadow-xl"
          >
            <p className="line-clamp-4 whitespace-pre-wrap text-sm font-medium leading-5">
              {item.prompt}
            </p>
            <div className="my-2.5 border-t border-border" />
            <p className="line-clamp-4 text-xs leading-5 text-muted-foreground">
              {item.response ?? t('promptHistoryPending')}
            </p>
          </TooltipContent>
        </Tooltip>
      ))}
    </nav>
  );
};

export default PromptHistoryRail;
