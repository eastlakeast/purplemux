import { Crown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface IOrchestratorIndicatorProps {
  className?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

const OrchestratorIndicator = ({
  className,
  side = 'top',
}: IOrchestratorIndicatorProps) => {
  const t = useTranslations('sidebar');
  const label = t('teamOrchestrator');

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className="inline-flex shrink-0 items-center justify-center"
              role="img"
              aria-label={label}
            />
          }
        >
          <Crown
            className={cn('h-3.5 w-3.5 text-[var(--focus-indicator)]', className)}
            aria-hidden="true"
          />
        </TooltipTrigger>
        <TooltipContent side={side}>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default OrchestratorIndicator;
