import { memo, type KeyboardEvent, type RefObject } from 'react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface IFindBarLabels {
  placeholder: string;
  previous: string;
  next: string;
  close: string;
}

interface IFindBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  matchCount: number;
  currentIndex: number;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  labels: IFindBarLabels;
  className?: string;
}

const FindBar = ({
  query,
  onQueryChange,
  matchCount,
  currentIndex,
  onNext,
  onPrevious,
  onClose,
  inputRef,
  labels,
  className,
}: IFindBarProps) => {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) onPrevious();
      else onNext();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  const hasQuery = query.trim().length > 0;

  return (
    <div
      className={cn(
        'absolute right-3 top-3 z-20 flex w-[min(22rem,calc(100%-1.5rem))] items-center gap-1.5 rounded-lg border border-border/60 bg-background/95 px-2 py-1.5 shadow-md backdrop-blur',
        className,
      )}
      role="search"
      onKeyDownCapture={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <Search size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
      <Input
        ref={inputRef}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={labels.placeholder}
        aria-label={labels.placeholder}
        className="h-7 min-w-0 flex-1 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
      />
      <span
        className="min-w-12 shrink-0 text-center text-xs tabular-nums text-muted-foreground"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {hasQuery ? `${matchCount > 0 ? currentIndex + 1 : 0}/${matchCount}` : ''}
      </span>
      <button
        type="button"
        onClick={onPrevious}
        disabled={matchCount === 0}
        aria-label={labels.previous}
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-indicator',
          matchCount === 0
            ? 'text-muted-foreground/40'
            : 'cursor-pointer text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        <ChevronUp size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={matchCount === 0}
        aria-label={labels.next}
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-indicator',
          matchCount === 0
            ? 'text-muted-foreground/40'
            : 'cursor-pointer text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label={labels.close}
        className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-indicator"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
};

export default memo(FindBar);
