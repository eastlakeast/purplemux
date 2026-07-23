import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { useLayoutStore } from '@/hooks/use-layout';
import { localFilePathFromHref, localFilePathToViewerUrl } from '@/lib/local-file-links';

export const TimelineMarkdownLink = ({
  href,
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) => {
  const filePath = localFilePathFromHref(href);
  const normalizedHref = filePath ? localFilePathToViewerUrl(filePath) : href;

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || !filePath) return;
    event.preventDefault();
    const sourcePaneId = event.currentTarget.closest<HTMLElement>('[data-pane-id]')?.dataset.paneId
      ?? useLayoutStore.getState().layout?.activePaneId;
    if (!sourcePaneId) return;
    void useLayoutStore.getState().openLocalFileViewer(sourcePaneId, filePath);
  };

  return (
    <a
      {...props}
      href={normalizedHref}
      onClick={handleClick}
      target="_blank"
      rel="noopener noreferrer"
    />
  );
};
