import { defaultUrlTransform, type UrlTransform } from 'react-markdown';
import { localFileViewerUrlFromHref } from '@/lib/local-file-links';

export const timelineUrlTransform: UrlTransform = (url) =>
  localFileViewerUrlFromHref(url) ?? defaultUrlTransform(url);
