const ROOTED_FILE_PATH_RE = /^(?:\/(?!\/)|~\/|\.\.?\/|\.[^/\\\s]+\/)[^\0]*$/;
const NAMED_RELATIVE_FILE_PATH_RE = /^(?![a-z][a-z0-9+.-]*:\/\/)(?:[^/\\\s]+\/)+[^\0]*$/i;
const BARE_FILE_PATH_RE = /^[^/\\\s]+$/;
const VIEWABLE_EXTENSIONS = new Set([
  'avif', 'bash', 'bmp', 'c', 'cc', 'conf', 'cpp', 'cs', 'css', 'csv', 'env', 'fish',
  'geojson', 'gif', 'go', 'gql', 'graphql', 'groovy', 'h', 'hpp', 'htm', 'html', 'ico',
  'ini', 'java', 'jpeg', 'jpg', 'js', 'json', 'jsonc', 'jsx', 'kt', 'kts', 'lock', 'log',
  'lua', 'markdown', 'md', 'mdown', 'mjs', 'mkd', 'pdf', 'php', 'plist', 'png', 'properties',
  'proto', 'py', 'rb', 'rs', 'sh', 'sql', 'svelte', 'svg', 'swift', 'toml', 'ts', 'tsx',
  'txt', 'vue', 'webp', 'xml', 'yaml', 'yml', 'zsh',
]);
const VIEWABLE_EXTENSIONLESS_FILES = new Set([
  'dockerfile', 'gemfile', 'license', 'makefile', 'procfile', 'readme',
]);
const APP_PATH_RE = /^\/(?:api|_next|viewer)(?:\/|$)/;
const LOCALHOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const LOCAL_FILE_VIEWER_PATH = '/viewer/local';
const LOCAL_FILE_CONTENT_PREFIX = '/api/local-file/';

const stripSuffix = (value: string): string => {
  const hashIdx = value.indexOf('#');
  const queryIdx = value.indexOf('?');
  const suffixIdx = [hashIdx, queryIdx]
    .filter((idx) => idx >= 0)
    .sort((a, b) => a - b)[0];
  return suffixIdx === undefined ? value : value.slice(0, suffixIdx);
};

const safeDecodeURIComponent = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const isLocalFilePath = (value: string): boolean => {
  const pathValue = stripSuffix(value.trim());
  const hasPathShape = ROOTED_FILE_PATH_RE.test(pathValue)
    || NAMED_RELATIVE_FILE_PATH_RE.test(pathValue)
    || BARE_FILE_PATH_RE.test(pathValue);
  if (!hasPathShape || pathValue.endsWith('/')) return false;

  const fileName = pathValue.split('/').at(-1)?.toLowerCase() ?? '';
  if (!fileName) return false;
  if (/^\.[a-z0-9_-]+(?:\.[a-z0-9_-]+)*$/i.test(fileName)) return true;
  if (VIEWABLE_EXTENSIONLESS_FILES.has(fileName)) return true;
  const extension = fileName.includes('.') ? fileName.split('.').at(-1) ?? '' : '';
  return VIEWABLE_EXTENSIONS.has(extension);
};

export const localFilePathToUrl = (filePath: string): string => {
  const decoded = safeDecodeURIComponent(filePath.trim());
  const segments = decoded.split('/').map((segment, idx) =>
    idx === 0 ? '' : encodeURIComponent(segment),
  );
  return `file://${segments.join('/')}`;
};

export const localFilePathToContentUrl = (filePath: string): string => {
  const decoded = safeDecodeURIComponent(filePath.trim());
  const encodedPath = decoded
    .split('/')
    .slice(1)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${LOCAL_FILE_CONTENT_PREFIX}${encodedPath}`;
};

export const localFilePathToViewerUrl = (filePath: string, basePath?: string): string => {
  const pathQuery = `path=${encodeURIComponent(safeDecodeURIComponent(filePath.trim()))}`;
  const baseQuery = basePath?.trim()
    ? `&base=${encodeURIComponent(safeDecodeURIComponent(basePath.trim()))}`
    : '';
  return `${LOCAL_FILE_VIEWER_PATH}?${pathQuery}${baseQuery}`;
};

const pathFromContentUrl = (pathname: string): string | null => {
  if (!pathname.startsWith(LOCAL_FILE_CONTENT_PREFIX)) return null;
  const encodedPath = pathname.slice(LOCAL_FILE_CONTENT_PREFIX.length);
  const decodedPath = safeDecodeURIComponent(encodedPath);
  const filePath = `/${decodedPath}`;
  return isLocalFilePath(filePath) ? filePath : null;
};

const pathFromAppUrl = (url: URL): string | null => {
  if (url.pathname === LOCAL_FILE_VIEWER_PATH) {
    const filePath = url.searchParams.get('path');
    if (!filePath) return null;
    const decodedPath = safeDecodeURIComponent(filePath);
    return isLocalFilePath(decodedPath) ? decodedPath : null;
  }

  return pathFromContentUrl(url.pathname);
};

export const localFilePathFromHref = (href: string | undefined | null): string | null => {
  if (!href) return null;
  const trimmed = href.trim();
  if (!trimmed) return null;

  if (isLocalFilePath(trimmed) && !(trimmed.startsWith('/') && APP_PATH_RE.test(trimmed))) {
    return safeDecodeURIComponent(stripSuffix(trimmed));
  }

  try {
    const isRelativeAppUrl = trimmed.startsWith('/');
    const url = new URL(trimmed, 'http://localhost');
    if (url.protocol === 'file:') {
      const filePath = safeDecodeURIComponent(url.pathname);
      return isLocalFilePath(filePath) && !APP_PATH_RE.test(filePath) ? filePath : null;
    }
    if (!isRelativeAppUrl && !LOCALHOSTS.has(url.hostname)) return null;

    const appPath = pathFromAppUrl(url);
    if (appPath) return appPath;

    if ((url.protocol === 'http:' || url.protocol === 'https:') && LOCALHOSTS.has(url.hostname)) {
      const filePath = safeDecodeURIComponent(url.pathname);
      return isLocalFilePath(filePath) && !APP_PATH_RE.test(filePath) ? filePath : null;
    }
  } catch {
    return null;
  }

  return null;
};

export const localFileViewerUrlFromHref = (href: string | undefined | null): string | null => {
  const filePath = localFilePathFromHref(href);
  return filePath ? localFilePathToViewerUrl(filePath) : null;
};

export const localFileName = (filePath: string): string => {
  const segments = filePath.split('/').filter(Boolean);
  return safeDecodeURIComponent(segments.at(-1) ?? filePath);
};

export const localFileUrlFromHref = (href: string | undefined | null): string | null => {
  const filePath = localFilePathFromHref(href);
  return filePath?.startsWith('/') ? localFilePathToUrl(filePath) : null;
};
