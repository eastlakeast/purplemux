import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { useLayoutStore } from '@/hooks/use-layout';
import { localFilePathFromHref, localFilePathToViewerUrl } from '@/lib/local-file-links';
import { captureTimelineScroll, restoreTimelineScrollAfterLayout } from '@/lib/timeline-scroll-anchor';

export const TimelineMarkdownLink = ({
  href,
  onClick,
  node: _node,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown }) => {
  const filePath = localFilePathFromHref(href);
  const normalizedHref = filePath ? localFilePathToViewerUrl(filePath) : href;

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || !filePath) return;
    event.preventDefault();
    const sourcePaneId = event.currentTarget.closest<HTMLElement>('[data-pane-id]')?.dataset.paneId
      ?? useLayoutStore.getState().layout?.activePaneId;
    if (!sourcePaneId) return;
    const scrollSnapshot = captureTimelineScroll(event.currentTarget);
    void useLayoutStore.getState().openLocalFileViewer(sourcePaneId, filePath).finally(() => {
      if (scrollSnapshot) restoreTimelineScrollAfterLayout(scrollSnapshot);
    });
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
