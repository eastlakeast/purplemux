import {
  Children,
  cloneElement,
  isValidElement,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { TimelineMarkdownLink } from '@/components/features/timeline/timeline-markdown-link';
import { splitTimelineLocalFilePaths } from '@/lib/timeline-local-file-paths';

const linkifyText = (value: string): ReactNode => {
  const segments = splitTimelineLocalFilePaths(value);
  if (!segments) return value;
  return segments.map(({ value: segmentValue, filePath }, index) => filePath
    ? (
        <TimelineMarkdownLink
          key={`${filePath}:${index}`}
          href={filePath}
          className="cursor-pointer underline underline-offset-2"
        >
          {segmentValue}
        </TimelineMarkdownLink>
      )
    : segmentValue);
};

const linkifyChildren = (children: ReactNode): ReactNode =>
  Children.map(children, (child) => {
    if (typeof child === 'string') return linkifyText(child);
    if (!isValidElement<{ children?: ReactNode }>(child) || child.props.children === undefined) {
      return child;
    }
    return cloneElement(child, undefined, linkifyChildren(child.props.children));
  });

export const TimelineMarkdownPre = ({
  children,
  node: _node,
  ...props
}: HTMLAttributes<HTMLPreElement> & { node?: unknown }) => (
  <pre {...props}>{linkifyChildren(children)}</pre>
);
