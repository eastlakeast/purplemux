import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import useMessageHistory from '@/hooks/use-message-history';
import { useLayoutStore } from '@/hooks/use-layout';
import { buildPromptHistoryItems } from '@/lib/prompt-history';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ITimelineEntry } from '@/types/timeline';

interface IPromptHistoryRailProps {
  entries: ITimelineEntry[];
  onNavigate: (entryId: string) => void;
}

const PromptHistoryRail = ({ entries, onNavigate }: IPromptHistoryRailProps) => {
  const t = useTranslations('timeline');
  const workspaceId = useLayoutStore((state) => state.workspaceId) ?? undefined;
  const { entries: userHistory } = useMessageHistory({ wsId: workspaceId });
  const [activeId, setActiveId] = useState<string | null>(null);
  const promptItems = useMemo(
    () => buildPromptHistoryItems(entries, userHistory),
    [entries, userHistory],
  );

  if (promptItems.length === 0) return null;

  return (
    <nav
      className="absolute inset-y-4 right-1.5 z-20 hidden w-7 flex-col overflow-y-auto [scrollbar-width:none] sm:flex [&::-webkit-scrollbar]:hidden"
      aria-label={t('promptHistory')}
    >
      <TooltipProvider delay={0}>
        <div className="flex min-h-full shrink-0 flex-col justify-center">
          {promptItems.map((item) => (
            <Tooltip key={item.entryId}>
              <TooltipTrigger
                render={(
                  <button
                    type="button"
                    className="group flex h-5 w-7 shrink-0 items-center justify-end rounded-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-indicator"
                    onClick={() => {
                      setActiveId(item.entryId);
                      onNavigate(item.entryId);
                    }}
                    aria-label={t('jumpToPrompt', { prompt: item.prompt })}
                  >
                    <span
                      className={cn(
                        'h-0.5 w-2 rounded-full bg-muted-foreground/45 transition-[width,background-color] group-hover:w-6 group-hover:bg-foreground/80',
                        activeId === item.entryId && 'w-6 bg-foreground/80',
                      )}
                      aria-hidden="true"
                    />
                  </button>
                )}
              />
              <TooltipContent
                side="left"
                sideOffset={8}
                align="center"
                showArrow={false}
                className="block w-96 max-w-[calc(100vw-3rem)] rounded-xl bg-popover px-4 py-3.5 text-left text-popover-foreground shadow-lg data-open:animate-none data-[state=delayed-open]:animate-none"
              >
                <p className="line-clamp-4 whitespace-pre-wrap text-sm font-medium leading-5">
                  {item.prompt}
                </p>
                <p className="mt-3 line-clamp-4 text-sm leading-5 text-muted-foreground">
                  {item.response ?? t('promptHistoryPending')}
                </p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    </nav>
  );
};

export default PromptHistoryRail;
