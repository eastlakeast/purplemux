import { splitTimelineLocalFilePaths } from '@/lib/timeline-local-file-paths';

interface IMarkdownNode {
  type?: string;
  value?: string;
  url?: string;
  children?: IMarkdownNode[];
}

const SKIP_CHILDREN = new Set(['link', 'linkReference', 'definition', 'code', 'inlineCode']);

const splitLocalFilePaths = (value: string): IMarkdownNode[] | null => {
  const segments = splitTimelineLocalFilePaths(value);
  if (!segments) return null;
  return segments.map(({ value: segmentValue, filePath }) => filePath
    ? {
        type: 'link',
        url: filePath,
        children: [{ type: 'text', value: segmentValue }],
      }
    : { type: 'text', value: segmentValue });
};

const transformNode = (node: IMarkdownNode): void => {
  if (!node.children || SKIP_CHILDREN.has(node.type ?? '')) return;

  for (let idx = 0; idx < node.children.length; idx += 1) {
    const child = node.children[idx];
    if (child.type === 'text' && typeof child.value === 'string') {
      const replacement = splitLocalFilePaths(child.value);
      if (replacement) {
        node.children.splice(idx, 1, ...replacement);
        idx += replacement.length - 1;
      }
      continue;
    }
    transformNode(child);
  }
};

export const remarkLocalFileLinks = () => (tree: IMarkdownNode): void => {
  transformNode(tree);
};
