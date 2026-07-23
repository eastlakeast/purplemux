const LOCAL_FILE_PATH_RE = /^\/(?:tmp|private\/tmp|var\/folders|Users|Volumes)(?:\/|$)/;
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

export const isLocalFilePath = (value: string): boolean =>
  LOCAL_FILE_PATH_RE.test(stripSuffix(value.trim()));

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

export const localFilePathToViewerUrl = (filePath: string): string =>
  `${LOCAL_FILE_VIEWER_PATH}?path=${encodeURIComponent(safeDecodeURIComponent(filePath.trim()))}`;

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

  if (trimmed.startsWith('/') && isLocalFilePath(trimmed)) {
    return safeDecodeURIComponent(stripSuffix(trimmed));
  }

  try {
    const isRelativeAppUrl = trimmed.startsWith('/');
    const url = new URL(trimmed, 'http://localhost');
    if (url.protocol === 'file:') {
      const filePath = safeDecodeURIComponent(url.pathname);
      return isLocalFilePath(filePath) ? filePath : null;
    }
    if (!isRelativeAppUrl && !LOCALHOSTS.has(url.hostname)) return null;

    const appPath = pathFromAppUrl(url);
    if (appPath) return appPath;

    if ((url.protocol === 'http:' || url.protocol === 'https:') && LOCALHOSTS.has(url.hostname)) {
      const filePath = safeDecodeURIComponent(url.pathname);
      return isLocalFilePath(filePath) ? filePath : null;
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
  return filePath ? localFilePathToUrl(filePath) : null;
};
