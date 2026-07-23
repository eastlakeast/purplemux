import { describe, expect, it } from 'vitest';
import {
  isLocalFilePath,
  localFilePathFromHref,
  localFilePathToContentUrl,
  localFilePathToUrl,
  localFilePathToViewerUrl,
  localFileUrlFromHref,
  localFileViewerUrlFromHref,
} from '@/lib/local-file-links';

describe('local-file-links', () => {
  it('turns temporary file paths into file URLs', () => {
    expect(localFileUrlFromHref('/tmp/aios-screen-mockup/aios-main.png'))
      .toBe('file:///tmp/aios-screen-mockup/aios-main.png');
  });

  it('encodes spaces and URL-reserved characters in local file URLs', () => {
    expect(localFilePathToUrl('/tmp/a b/report#1.json'))
      .toBe('file:///tmp/a%20b/report%231.json');
  });

  it('rewrites localhost URLs that point at local file roots', () => {
    expect(localFileUrlFromHref('http://localhost:8022/tmp/aios-main.png'))
      .toBe('file:///tmp/aios-main.png');
    expect(localFileUrlFromHref('http://127.0.0.1:8022/Users/donghojo/out.html'))
      .toBe('file:///Users/donghojo/out.html');
  });

  it('allows only known local file roots for file URLs', () => {
    expect(localFileUrlFromHref('file:///tmp/aios-main.png')).toBe('file:///tmp/aios-main.png');
    expect(localFileUrlFromHref('file:///etc/passwd')).toBeNull();
  });

  it('leaves app-relative and remote links alone', () => {
    expect(localFileUrlFromHref('/api/timeline/entries')).toBeNull();
    expect(localFileUrlFromHref('https://example.com/tmp/a.png')).toBeNull();
    expect(isLocalFilePath('/workspace/project/file.md')).toBe(false);
  });

  it('creates internal content and viewer URLs', () => {
    expect(localFilePathToContentUrl('/Users/donghojo/My Notes/read me.md'))
      .toBe('/api/local-file/Users/donghojo/My%20Notes/read%20me.md');
    expect(localFilePathToViewerUrl('/tmp/read me.md'))
      .toBe('/viewer/local?path=%2Ftmp%2Fread%20me.md');
  });

  it('recovers file paths from internal viewer and content URLs', () => {
    expect(localFilePathFromHref('/viewer/local?path=%2Ftmp%2Fread%20me.md'))
      .toBe('/tmp/read me.md');
    expect(localFilePathFromHref('http://localhost:8022/api/local-file/Users/donghojo/readme.md'))
      .toBe('/Users/donghojo/readme.md');
  });

  it('rewrites local hrefs to the internal viewer', () => {
    expect(localFileViewerUrlFromHref('file:///tmp/readme.md'))
      .toBe('/viewer/local?path=%2Ftmp%2Freadme.md');
  });
});
