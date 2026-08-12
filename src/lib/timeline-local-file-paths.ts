import { isLocalFilePath } from '@/lib/local-file-links';

export interface ITimelineLocalFilePathSegment {
  value: string;
  filePath?: string;
}

const PATH_TOKEN_RE = /(^|[\s([{<])([^\s`"'<>\])}]+)/g;
const TRAILING_PUNCTUATION_RE = /[.,;:!?，。；：！？]+$/;

export const splitTimelineLocalFilePaths = (
  value: string,
): ITimelineLocalFilePathSegment[] | null => {
  const segments: ITimelineLocalFilePathSegment[] = [];
  let cursor = 0;

  for (const match of value.matchAll(PATH_TOKEN_RE)) {
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
      segments.push({ value: value.slice(cursor, pathStart) });
    }
    segments.push({ value: filePath, filePath });
    cursor = pathEnd;
  }

  if (segments.length === 0) return null;
  if (cursor < value.length) {
    segments.push({ value: value.slice(cursor) });
  }
  return segments;
};
