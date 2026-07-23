import { isLocalFilePath } from '@/lib/local-file-links';

interface IMarkdownNode {
  type?: string;
  value?: string;
  url?: string;
  children?: IMarkdownNode[];
}

const LOCAL_FILE_PATH_RE = /(^|[\s([{<])((?:\/tmp|\/private\/tmp|\/var\/folders|\/Users|\/Volumes)\/[^\s`"'<>)]*)/g;
const TRAILING_PUNCTUATION_RE = /[.,;:!?]+$/;
const SKIP_CHILDREN = new Set(['link', 'linkReference', 'definition', 'code', 'inlineCode']);

const splitLocalFilePaths = (value: string): IMarkdownNode[] | null => {
  const nodes: IMarkdownNode[] = [];
  let cursor = 0;

  for (const match of value.matchAll(LOCAL_FILE_PATH_RE)) {
    const prefix = match[1] ?? '';
    const rawPath = match[2] ?? '';
    if (!rawPath) continue;

    const pathStart = match.index + prefix.length;
    let pathEnd = pathStart + rawPath.length;
    const trailing = rawPath.match(TRAILING_PUNCTUATION_RE)?.[0] ?? '';
    if (trailing) pathEnd -= trailing.length;

    const filePath = value.slice(pathStart, pathEnd);
    if (!isLocalFilePath(filePath)) continue;

    if (pathStart > cursor) {
      nodes.push({ type: 'text', value: value.slice(cursor, pathStart) });
    }
    nodes.push({
      type: 'link',
      url: filePath,
      children: [{ type: 'text', value: filePath }],
    });
    cursor = pathEnd;
  }

  if (nodes.length === 0) return null;
  if (cursor < value.length) {
    nodes.push({ type: 'text', value: value.slice(cursor) });
  }
  return nodes;
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
