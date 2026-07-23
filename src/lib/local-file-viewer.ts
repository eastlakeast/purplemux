import {
  localFilePathToContentUrl,
  localFilePathToUrl,
  localFilePathToViewerUrl,
} from '@/lib/local-file-links';

export type TLocalFileKind = 'markdown' | 'image' | 'html' | 'json' | 'text' | 'document';

const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdown', 'mkd']);
const IMAGE_EXTENSIONS = new Set(['avif', 'bmp', 'gif', 'ico', 'jpeg', 'jpg', 'png', 'svg', 'webp']);
const HTML_EXTENSIONS = new Set(['htm', 'html']);
const JSON_EXTENSIONS = new Set(['json', 'jsonc', 'geojson']);
const TEXT_EXTENSIONS = new Set([
  'conf', 'css', 'csv', 'env', 'ini', 'js', 'jsx', 'log', 'mjs', 'properties', 'sh', 'sql',
  'toml', 'ts', 'tsx', 'txt', 'xml', 'yaml', 'yml',
]);

const extensionOf = (filePath: string): string => {
  const fileName = filePath.split('/').at(-1) ?? '';
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex >= 0 ? fileName.slice(dotIndex + 1).toLowerCase() : '';
};

export const getLocalFileKind = (filePath: string): TLocalFileKind => {
  const extension = extensionOf(filePath);
  if (MARKDOWN_EXTENSIONS.has(extension)) return 'markdown';
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (HTML_EXTENSIONS.has(extension)) return 'html';
  if (JSON_EXTENSIONS.has(extension)) return 'json';
  if (TEXT_EXTENSIONS.has(extension) || !extension) return 'text';
  return 'document';
};

const isRemoteUrl = (value: string): boolean => /^(?:https?:|data:|blob:|mailto:|tel:)/i.test(value);

export const resolveLocalFileReference = (
  documentPath: string,
  reference: string,
): { filePath: string; suffix: string } | null => {
  const trimmed = reference.trim();
  if (!trimmed || trimmed.startsWith('#') || isRemoteUrl(trimmed)) return null;

  const suffixIndex = [trimmed.indexOf('?'), trimmed.indexOf('#')]
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  const pathPart = suffixIndex === undefined ? trimmed : trimmed.slice(0, suffixIndex);
  const suffix = suffixIndex === undefined ? '' : trimmed.slice(suffixIndex);

  try {
    const baseUrl = new URL(localFilePathToUrl(documentPath));
    const resolved = new URL(pathPart, baseUrl);
    if (resolved.protocol !== 'file:') return null;
    return { filePath: decodeURIComponent(resolved.pathname), suffix };
  } catch {
    return null;
  }
};

export const localViewerUrlTransform = (
  documentPath: string,
  url: string,
  key: string,
): string => {
  const resolved = resolveLocalFileReference(documentPath, url);
  if (!resolved) return url;
  const transformed = key === 'href'
    ? localFilePathToViewerUrl(resolved.filePath)
    : localFilePathToContentUrl(resolved.filePath);
  return `${transformed}${resolved.suffix}`;
};
