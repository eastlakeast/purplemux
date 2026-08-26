import { memo, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import FindBar from '@/components/ui/find-bar';

interface ITimelineSearchBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  matchCount: number;
  currentIndex: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
}

const TimelineSearchBar = ({
  query,
  onQueryChange,
  matchCount,
  currentIndex,
  onNext,
  onPrev,
  onClose,
  inputRef,
}: ITimelineSearchBarProps) => {
  const t = useTranslations('timeline');

  return (
    <FindBar
      query={query}
      onQueryChange={onQueryChange}
      matchCount={matchCount}
      currentIndex={currentIndex}
      onNext={onNext}
      onPrevious={onPrev}
      onClose={onClose}
      inputRef={inputRef}
      labels={{
        placeholder: t('searchPlaceholder'),
        previous: t('searchPrev'),
        next: t('searchNext'),
        close: t('searchClose'),
      }}
    />
  );
};

export default memo(TimelineSearchBar);
